import type { EstadoActivo, Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { logger } from '@/shared/logger';
import { ConflictError, errorRepetido, NotFoundError, ValidationError } from '@/shared/errores';
import { MENSAJE_CAMBIO_SIMULTANEO } from '@/shared/utilidades/concurrencia';
import {
  MENSAJE_GARANTIA_ANTES_DE_COMPRA,
  terminaAntesDeEmpezar,
} from '@/shared/validaciones/ordenFechas';
import { sedeIdParaCrear } from '@/shared/sedes/filtro';
import { exigirSedeActiva } from '@/shared/sedes/consultas';
import type { CreateAssetInput, UpdateAssetInput } from '@/modules/activos/validaciones';
import type { AssetVentaInput } from '@/modules/activos/validacionesTransicion';
import { etiquetaEstadoActivo } from '@/modules/activos/estados';
import { assetHistoryService, type AssetHistoryData } from '@/modules/activos/historial';
import { validateTransition, type TransitionContext } from '@/modules/activos/maquinaEstados';

type Tx = Prisma.TransactionClient;

/**
 * Unico camino para cambiar el estado de un equipo (SPEC 2.118). Los demas
 * modulos no escriben en las tablas de activos: llaman a esta funcion.
 * 1. Valida la transicion con la maquina de estados (409 si no corresponde).
 *    Si el estado no cambia (ej. un "no devuelto" que se vuelve a marcar),
 *    no hay transicion que validar: solo se guardan los datos.
 * 2. Cambia el estado solo si el equipo sigue como se leyo, y cumple
 *    `exigir` (ej. sin empleado): si otro lo cambio en el intertanto, 409.
 * 3. Anota el historial, si se indica.
 */
export async function cambiarEstado(
  tx: Tx,
  p: {
    activo: { id: string; estado: EstadoActivo };
    a: EstadoActivo;
    /** Lo que piden las precondiciones de la maquina de estados (motivo, estado de devolucion...). */
    contexto?: Partial<TransitionContext>;
    /** Lo que cambia junto con el estado (empleado, sede, condicion, fechas). */
    datos?: Omit<Prisma.AssetUncheckedUpdateManyInput, 'estado'>;
    /** Condiciones extra que deben seguir iguales al guardar. */
    exigir?: Prisma.AssetWhereInput;
    historial?: Omit<AssetHistoryData, 'assetId'>;
    mensajeConflicto?: string;
  }
) {
  if (p.a !== p.activo.estado) {
    const transicion = validateTransition(p.activo.estado, p.a, {
      hasActiveAssignment: false,
      hasActiveMaintenance: false,
      ...p.contexto,
    });
    if (!transicion.valid) throw new ConflictError(transicion.errors[0]);
  }

  const { count } = await tx.asset.updateMany({
    where: { id: p.activo.id, estado: p.activo.estado, deletedAt: null, ...p.exigir },
    data: { ...p.datos, estado: p.a },
  });
  if (count !== 1) throw new ConflictError(p.mensajeConflicto ?? MENSAJE_CAMBIO_SIMULTANEO);

  if (p.historial) await assetHistoryService.registrar({ assetId: p.activo.id, ...p.historial }, tx);
}

/**
 * Alta de un equipo desde la importacion: entra con el estado y los datos
 * que trae el Excel, ya revisados fila por fila (procesarFila), y deja su
 * evento de creacion en el historial.
 */
export async function crearActivoImportado(tx: Tx, datos: Prisma.AssetUncheckedCreateInput, usuario: string) {
  const asset = await tx.asset.create({ data: datos });
  await assetHistoryService.registrar(
    { assetId: asset.id, tipoEvento: 'creacion', descripcion: 'Activo importado desde Excel', usuarioSistema: usuario },
    tx
  );
  return asset;
}

/** Equipos que se asocian a una compra: toman su fecha de compra (SPEC 2.111). */
export async function fijarFechaCompra(tx: Tx, ids: string[], fechaCompra: Date) {
  await tx.asset.updateMany({ where: { id: { in: ids } }, data: { fechaCompra } });
}

/** Equipos "Por repartir" que siguen a su compra cuando cambia la sede de llegada (SPEC 2.111). */
export async function moverSedeDeCompra(tx: Tx, ids: string[], sedeId: string) {
  await tx.asset.updateMany({ where: { id: { in: ids } }, data: { sedeId } });
}

/**
 * Lo que identifica a un equipo como unico (SPEC 2.112.7): el IMEI en los
 * celulares (obligatorio; el N° de serie ahi es opcional) y el N° de serie en
 * los demas (obligatorio al crear). Ningun IMEI se repite. La usan crear
 * (Activos y Compras, via crearActivo) y editar (PUT /api/activos/[id]); la
 * importacion aplica la misma regla por fila (procesarFila).
 */
export async function reglasIdentificacion(
  tx: Tx,
  d: { categoriaId: string; numeroSerie?: string | null; imei?: string | null },
  opciones: { crear: boolean; exceptoId?: string }
) {
  const categoria = await tx.assetCategory.findUnique({ where: { id: d.categoriaId }, select: { tipoFicha: true } });
  const esCelular = categoria?.tipoFicha === 'celular';
  const campo = (field: string, message: string) => new ValidationError(message, [{ field, message }]);
  if (esCelular && !d.imei) throw campo('imei', 'Escribe el IMEI del celular');
  if (!esCelular && opciones.crear && !d.numeroSerie?.trim()) throw campo('numeroSerie', 'Escribe el número de serie');
  if (d.imei) {
    const otro = await tx.asset.findFirst({
      where: { imei: d.imei, ...(opciones.exceptoId && { NOT: { id: opciones.exceptoId } }) },
      select: { id: true },
    });
    if (otro) throw errorRepetido('imei', `Ya existe un activo con el IMEI ${d.imei}`);
  }
}

/**
 * Crea un equipo con las reglas de Activos > Nuevo: N° de serie unico y el
 * evento de creacion en su historial. Lo usan el alta de Activos y las
 * compras, que crean sus equipos "Por repartir" (SPEC 2.111) dentro de su
 * propia transaccion.
 */
export async function crearActivo(
  tx: Tx,
  datos: Omit<CreateAssetInput, 'estado'>,
  opciones: { sedeId: string | null; usuario: string; estado?: EstadoActivo }
) {
  await reglasIdentificacion(tx, datos, { crear: true });
  if (datos.numeroSerie) {
    const existente = await tx.asset.findUnique({ where: { numeroSerie: datos.numeroSerie } });
    if (existente) {
      throw errorRepetido(
        'numeroSerie',
        `Ya existe un activo con el número de serie ${datos.numeroSerie}`
      );
    }
  }

  const asset = await tx.asset.create({
    data: {
      categoriaId: datos.categoriaId,
      sedeId: opciones.sedeId,
      marca: datos.marca,
      modelo: datos.modelo,
      numeroSerie: datos.numeroSerie || null,
      estado: opciones.estado ?? 'disponible',
      condicion: datos.condicion || 'nuevo',
      fechaCompra: datos.fechaCompra ? new Date(datos.fechaCompra) : null,
      fechaGarantiaFin: datos.fechaGarantiaFin ? new Date(datos.fechaGarantiaFin) : null,
      procesador: datos.procesador || null,
      ram: datos.ram || null,
      discoDuro: datos.discoDuro || null,
      sistemaOperativo: datos.sistemaOperativo || null,
      imei: datos.imei || null,
      numeroTelefono: datos.numeroTelefono || null,
      numeroActivacion: datos.numeroActivacion || null,
      tipoPlan: datos.tipoPlan || null,
      tieneCargador: datos.tieneCargador || false,
      pulgadas: datos.pulgadas || null,
      ubicacionFisica: datos.ubicacionFisica || null,
      microsoft365: datos.microsoft365 || false,
      tipoLicenciaMicrosoft365: datos.tipoLicenciaMicrosoft365 || null,
      intuneEnrolled: datos.intuneEnrolled || false,
      listaDistribucion: datos.listaDistribucion || null,
      observaciones: datos.observaciones || null,
      antivirus: datos.antivirus || null,
      incidencia: datos.incidencia || null,
      nombreEquipo: datos.nombreEquipo || null,
      conectividad: datos.conectividad || null,
      valor: datos.valor ?? null,
    },
  });

  await assetHistoryService.registrarCreacion(asset, opciones.usuario, tx);
  return asset;
}

/**
 * Alta de un equipo desde Activos > Nuevo (POST /api/activos): la sede elegida
 * en el formulario es obligatoria y debe estar activa (SPEC 2.117); el resto
 * de las reglas son las de crearActivo.
 */
export async function registrarActivo(
  datos: CreateAssetInput,
  sedeIdPedido: string | undefined,
  usuario: string
) {
  const sedeId = sedeIdParaCrear(sedeIdPedido, { requerido: true });
  if (sedeId) await exigirSedeActiva(sedeId);
  return prisma.$transaction((tx) => crearActivo(tx, datos, { sedeId, usuario }));
}

/**
 * Venta de un equipo (POST /api/activos/[id]/venta): solo desde "baja" y sin
 * asignacion activa. Dos ventas a la vez no se registran dos veces
 * (cambiarEstado exige que siga de baja y sin empleado).
 */
export async function venderActivo(id: string, data: AssetVentaInput, usuario: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: { assignments: { where: { activo: true } } },
  });
  if (!asset) throw new NotFoundError('Activo no encontrado');
  // Un registro descartado es basura de importacion: no genera movimientos.
  if (asset.deletedAt) throw new ConflictError('Este activo esta descartado y no admite movimientos');
  if (asset.estado !== 'baja') {
    throw new ValidationError(
      `El activo debe estar en estado "baja" para vender. Estado actual: ${etiquetaEstadoActivo(asset.estado)}`
    );
  }
  if (asset.assignments.length > 0) {
    throw new ValidationError('El activo tiene una asignación activa. No se puede vender.');
  }
  const motivo = `Venta a ${data.comprador}`;
  const transicion = validateTransition(asset.estado, 'vendido', {
    hasActiveAssignment: false,
    hasActiveMaintenance: false,
    motivo,
  });
  if (!transicion.valid) throw new ValidationError('Transición no permitida', transicion.errors);

  return prisma.$transaction(async (tx) => {
    await cambiarEstado(tx, {
      activo: { id, estado: 'baja' },
      a: 'vendido',
      contexto: { motivo },
      datos: { fechaVenta: data.fechaVenta },
      exigir: { empleadoActualId: null },
    });
    const vendido = await tx.asset.findUniqueOrThrow({ where: { id }, include: { categoria: true } });
    await assetHistoryService.registrarVenta(
      id,
      data.comprador,
      Number(data.monto),
      usuario,
      data.fechaVenta,
      data.moneda,
      tx
    );
    return vendido;
  });
}

/**
 * Descarta un registro de equipo: no se borra (su historial es evidencia,
 * SPEC 2.7.7), se marca `deletedAt` y queda el motivo en su historial. Lo
 * usan el descarte de duplicados de importacion y quitar de una compra un
 * equipo que todavia no se reparte (SPEC 2.111.7).
 */
export async function descartarActivo(tx: Tx, assetId: string, motivo: string, usuario: string) {
  await assetHistoryService.registrar(
    {
      assetId,
      tipoEvento: 'baja',
      descripcion: `Registro descartado: ${motivo}`,
      datosAnteriores: { deletedAt: null },
      datosNuevos: { deletedAt: new Date().toISOString(), motivo },
      usuarioSistema: usuario,
    },
    tx
  );
  return tx.asset.update({ where: { id: assetId }, data: { deletedAt: new Date() } });
}

/** Pulgadas del formulario (texto o numero) a numero, o null si viene vacio. */
function leerPulgadas(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Edita la ficha de un equipo (PUT /api/activos/[id]). El estado no se edita
 * (SPEC 2.86): cada cambio pasa por su proceso, que deja los registros que lo
 * respaldan (solicitud, mantencion, baja, venta). Los cambios de
 * especificaciones quedan en el historial, en la misma transaccion.
 */
export async function editarActivo(id: string, datos: UpdateAssetInput, usuario: string) {
  const existente = await prisma.asset.findUnique({ where: { id } });
  if (!existente) throw new NotFoundError('Activo no encontrado');

  // Si solo llega una de las dos fechas, se compara con la ya guardada.
  if (
    terminaAntesDeEmpezar(
      datos.fechaCompra !== undefined ? datos.fechaCompra : existente.fechaCompra,
      datos.fechaGarantiaFin !== undefined ? datos.fechaGarantiaFin : existente.fechaGarantiaFin
    )
  ) {
    throw new ValidationError(MENSAJE_GARANTIA_ANTES_DE_COMPRA, [
      { field: 'fechaGarantiaFin', message: MENSAJE_GARANTIA_ANTES_DE_COMPRA },
    ]);
  }
  // IMEI obligatorio si queda en una categoria de celular, y que no se
  // repita (SPEC 2.112.7).
  await reglasIdentificacion(
    prisma,
    {
      categoriaId: datos.categoriaId ?? existente.categoriaId,
      imei: datos.imei !== undefined ? datos.imei : existente.imei,
    },
    { crear: false, exceptoId: id }
  );

  if (datos.numeroSerie && datos.numeroSerie !== existente.numeroSerie) {
    const repetido = await prisma.asset.findUnique({ where: { numeroSerie: datos.numeroSerie } });
    if (repetido) throw errorRepetido('numeroSerie', 'Ya existe un activo con este número de serie');
  }

  // Editarlo a mano dejaba incoherencias: "asignado" sin empleado, o
  // "disponible" con la asignacion todavia activa.
  if (datos.estado && datos.estado !== existente.estado) {
    throw new ConflictError(
      'El estado no se edita: cambia con su proceso (solicitudes, mantenciones, baja o venta).'
    );
  }

  // Cambios en especificaciones tecnicas, para el historial.
  const specsAnteriores: Record<string, unknown> = {};
  const specsNuevos: Record<string, unknown> = {};
  for (const field of ['procesador', 'ram', 'discoDuro', 'sistemaOperativo', 'pulgadas'] as const) {
    if (datos[field] === undefined) continue;
    // Pulgadas se compara como numero: la base guarda un decimal y el
    // formulario manda texto ("14"), que si no parecen distintos.
    const antes =
      field === 'pulgadas'
        ? existente.pulgadas === null
          ? null
          : Number(existente.pulgadas)
        : existente[field];
    const ahora = field === 'pulgadas' ? leerPulgadas(datos.pulgadas) : datos[field];
    if (ahora !== antes) {
      specsAnteriores[field] = antes;
      specsNuevos[field] = ahora;
    }
  }

  // El historial y el update van juntos: si el update falla, el historial no
  // registra un cambio que nunca ocurrio.
  return prisma.$transaction(async (tx) => {
    if (Object.keys(specsNuevos).length > 0) {
      await assetHistoryService.registrarActualizacionSpecs(
        id,
        specsAnteriores as Prisma.InputJsonValue,
        specsNuevos as Prisma.InputJsonValue,
        usuario,
        tx
      );
    }
    // El valor se actualiza a mano; cada cambio queda en el historial (SPEC 2.124).
    if (datos.valor !== undefined && datos.valor !== existente.valor) {
      await assetHistoryService.registrarCambioValor(id, existente.valor, datos.valor, usuario, tx);
    }

    return tx.asset.update({
      where: { id },
      data: {
        ...(datos.categoriaId && { categoriaId: datos.categoriaId }),
        ...(datos.marca && { marca: datos.marca }),
        ...(datos.modelo && { modelo: datos.modelo }),
        ...(datos.numeroSerie !== undefined && { numeroSerie: datos.numeroSerie || null }),
        ...(datos.condicion && { condicion: datos.condicion }),
        ...(datos.fechaCompra !== undefined && {
          fechaCompra: datos.fechaCompra ? new Date(datos.fechaCompra) : null,
        }),
        ...(datos.fechaGarantiaFin !== undefined && {
          fechaGarantiaFin: datos.fechaGarantiaFin ? new Date(datos.fechaGarantiaFin) : null,
        }),
        ...(datos.procesador !== undefined && { procesador: datos.procesador || null }),
        ...(datos.ram !== undefined && { ram: datos.ram || null }),
        ...(datos.discoDuro !== undefined && { discoDuro: datos.discoDuro || null }),
        ...(datos.sistemaOperativo !== undefined && {
          sistemaOperativo: datos.sistemaOperativo || null,
        }),
        ...(datos.imei !== undefined && { imei: datos.imei || null }),
        ...(datos.numeroTelefono !== undefined && { numeroTelefono: datos.numeroTelefono || null }),
        ...(datos.numeroActivacion !== undefined && {
          numeroActivacion: datos.numeroActivacion || null,
        }),
        ...(datos.tipoPlan !== undefined && { tipoPlan: datos.tipoPlan || null }),
        ...(datos.tieneCargador !== undefined && { tieneCargador: datos.tieneCargador }),
        ...(datos.pulgadas !== undefined && { pulgadas: leerPulgadas(datos.pulgadas) }),
        ...(datos.ubicacionFisica !== undefined && {
          ubicacionFisica: datos.ubicacionFisica || null,
        }),
        ...(datos.microsoft365 !== undefined && { microsoft365: datos.microsoft365 }),
        ...(datos.tipoLicenciaMicrosoft365 !== undefined && {
          tipoLicenciaMicrosoft365: datos.tipoLicenciaMicrosoft365 || null,
        }),
        ...(datos.intuneEnrolled !== undefined && { intuneEnrolled: datos.intuneEnrolled }),
        ...(datos.listaDistribucion !== undefined && {
          listaDistribucion: datos.listaDistribucion || null,
        }),
        ...(datos.observaciones !== undefined && { observaciones: datos.observaciones || null }),
        ...(datos.antivirus !== undefined && { antivirus: datos.antivirus || null }),
        ...(datos.incidencia !== undefined && { incidencia: datos.incidencia || null }),
        ...(datos.nombreEquipo !== undefined && { nombreEquipo: datos.nombreEquipo || null }),
        ...(datos.conectividad !== undefined && { conectividad: datos.conectividad || null }),
        ...(datos.valor !== undefined && { valor: datos.valor }),
      },
    });
  });
}

/**
 * Elimina un equipo (DELETE /api/activos/[id]). Con historial o asignaciones
 * no se borra: su registro es evidencia de auditoria (SPEC 2.7.7, ISO 9001
 * 7.5.3); se da de baja, o se descarta si es un duplicado (con motivo). Solo
 * se borra de verdad el que nunca tuvo movimientos.
 */
export async function eliminarActivo(
  id: string,
  opciones: { descartar: boolean; motivo?: string },
  usuario: string
) {
  const existente = await prisma.asset.findUnique({
    where: { id },
    select: {
      marca: true,
      modelo: true,
      estado: true,
      deletedAt: true,
      _count: { select: { history: true, assignments: true } },
    },
  });
  if (!existente) throw new NotFoundError('Activo no encontrado');
  if (existente.deletedAt) throw new ConflictError('Este activo ya estaba descartado');

  // Un equipo en manos de alguien no se borra ni se descarta: primero se
  // devuelve. Si no, la persona queda con un equipo que el sistema no ve.
  if (existente.estado === 'asignado') {
    throw new ConflictError('El activo está asignado. Registra la devolución antes de eliminarlo.');
  }

  if (opciones.descartar) {
    if (!opciones.motivo) {
      throw new ValidationError('Descartar un activo requiere indicar el motivo (parámetro `motivo`)');
    }
    const motivo = opciones.motivo;
    const asset = await prisma.$transaction((tx) => descartarActivo(tx, id, motivo, usuario));
    return { descartado: true, asset };
  }

  if (existente._count.history > 0 || existente._count.assignments > 0) {
    throw new ConflictError(
      'El activo tiene historial o asignaciones y no puede eliminarse: su registro es evidencia de auditoría. Dalo de baja en su lugar.',
      {
        eventosHistorial: existente._count.history,
        asignaciones: existente._count.assignments,
        alternativas: {
          baja: `POST /api/mantenciones/baja`,
          descartarDuplicado: `DELETE /api/activos/${id}?descartar=true&motivo=...`,
        },
      }
    );
  }

  await prisma.asset.delete({ where: { id } });
  logger.info(
    `[activos] Borrado físico de ${existente.marca} ${existente.modelo} (${id}) por ${usuario}: sin historial ni asignaciones`
  );
  return { descartado: false };
}
