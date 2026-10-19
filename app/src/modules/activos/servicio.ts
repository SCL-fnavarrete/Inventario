import { alCambiarTenedorDelTelefono } from '@/modules/lineas/servidor';
import type { EstadoActivo, Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, errorRepetido, NotFoundError, ValidationError } from '@/shared/errores';
import { MENSAJE_CAMBIO_SIMULTANEO } from '@/shared/utilidades/concurrencia';
import {
  MENSAJE_GARANTIA_ANTES_DE_COMPRA,
  terminaAntesDeEmpezar,
} from '@/shared/validaciones/ordenFechas';
import { sedeIdParaCrear } from '@/shared/sedes/filtro';
import { exigirSedeExistente } from '@/shared/sedes/consultas';
import type { CreateAssetInput, UpdateAssetInput } from '@/modules/activos/validaciones';
import { EVENTOS_SIN_USO, motivoSinEliminar } from '@/modules/activos/estados';
import { assetHistoryService, type AssetHistoryData } from '@/modules/activos/historial';
import { auditLogService } from '@/shared/auditoria';
import { validateTransition, type TransitionContext } from '@/modules/activos/maquinaEstados';
import { idsDeCatalogos } from '@/modules/activos/catalogos';
import { MARCA_MODELO, NOMBRE, marcaModelo, type CampoCatalogo, type LlaveCatalogo } from '@/modules/activos/camposCatalogo';

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
 * 4. Si cambia quien tiene el equipo (entrega, devolucion, cancelacion), las
 *    lineas que estan en el lo anotan en su tenencia (SPEC 2.131). Es el unico
 *    camino por el que cambia el dueno de un equipo, asi que ningun cambio se
 *    escapa.
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

  // Quien lo tiene antes de cambiar, para saber a quien pasaba la linea.
  const nuevoTenedor = p.datos?.empleadoActualId;
  const cambiaTenedor = typeof nuevoTenedor === 'string' || nuevoTenedor === null;
  const tenedorAntes = cambiaTenedor
    ? ((await tx.asset.findUnique({ where: { id: p.activo.id }, select: { empleadoActualId: true } }))?.empleadoActualId ?? null)
    : null;

  const { count } = await tx.asset.updateMany({
    where: { id: p.activo.id, estado: p.activo.estado, deletedAt: null, ...p.exigir },
    data: { ...p.datos, estado: p.a },
  });
  if (count !== 1) throw new ConflictError(p.mensajeConflicto ?? MENSAJE_CAMBIO_SIMULTANEO);

  if (cambiaTenedor) {
    await alCambiarTenedorDelTelefono(tx, {
      activoId: p.activo.id,
      de: tenedorAntes,
      a: nuevoTenedor as string | null,
      detalle: p.historial?.descripcion,
    });
  }

  if (p.historial) await assetHistoryService.registrar({ assetId: p.activo.id, ...p.historial }, tx);
}

/** Datos de un equipo nuevo con sus opciones de catalogo por nombre (las traduce `idsDeCatalogos`). */
type AltaConNombres = Omit<Prisma.AssetUncheckedCreateInput, LlaveCatalogo> & { marca: string } & Partial<
  Record<Exclude<CampoCatalogo, 'marca'>, string | null>
>;

/**
 * Alta de un equipo desde la importacion: entra con el estado y los datos
 * que trae el Excel, ya revisados fila por fila (procesarFila), y deja su
 * evento de creacion en el historial.
 */
export async function crearActivoImportado(tx: Tx, datos: AltaConNombres, usuario: string) {
  const { marca, sistemaOperativo, antivirus, tipoLicenciaMicrosoft365, ...resto } = datos;
  // Datos historicos: una opcion que hoy esta desactivada se acepta igual.
  const ids = await idsDeCatalogos(tx, { marca, sistemaOperativo, antivirus, tipoLicenciaMicrosoft365 }, { aceptarDesactivadas: true });
  const asset = await tx.asset.create({ data: { ...resto, ...ids, marcaId: ids.marcaId! } });
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

  const ids = await idsDeCatalogos(tx, datos);
  const asset = await tx.asset.create({
    include: { marca: NOMBRE },
    data: {
      ...ids,
      marcaId: ids.marcaId!,
      categoriaId: datos.categoriaId,
      sedeId: opciones.sedeId,
      modelo: datos.modelo,
      numeroSerie: datos.numeroSerie || null,
      estado: opciones.estado ?? 'disponible',
      condicion: datos.condicion || 'nuevo',
      fechaCompra: datos.fechaCompra ? new Date(datos.fechaCompra) : null,
      fechaGarantiaFin: datos.fechaGarantiaFin ? new Date(datos.fechaGarantiaFin) : null,
      procesador: datos.procesador || null,
      ram: datos.ram || null,
      discoDuro: datos.discoDuro || null,
      imei: datos.imei || null,
      tieneCargador: datos.tieneCargador || false,
      pulgadas: datos.pulgadas || null,
      microsoft365: datos.microsoft365 || false,
      intuneEnrolled: datos.intuneEnrolled || false,
      listaDistribucion: datos.listaDistribucion || null,
      observaciones: datos.observaciones || null,
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
  if (sedeId) await exigirSedeExistente(sedeId);
  return prisma.$transaction((tx) => crearActivo(tx, datos, { sedeId, usuario }));
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
 * respaldan (solicitud, mantencion, baja). Los cambios de
 * especificaciones quedan en el historial, en la misma transaccion.
 */
export async function editarActivo(id: string, datos: UpdateAssetInput, usuario: string) {
  const existente = await prisma.asset.findUnique({ where: { id }, include: { sistemaOperativo: NOMBRE } });
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
      'El estado no se edita: cambia con su proceso (solicitudes, mantenciones o baja).'
    );
  }

  // Sede (SPEC 2.117): un equipo sin sede (importado sin ella) la recibe al
  // editar, una vez; despues cambia solo con una Guia de Despacho.
  const sedeNueva = datos.sedeId && datos.sedeId !== existente.sedeId ? datos.sedeId : null;
  if (sedeNueva) {
    if (existente.sedeId) throw new ConflictError('La sede del equipo cambia con una Guía de Despacho.');
    await exigirSedeExistente(sedeNueva);
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
        : field === 'sistemaOperativo'
          ? (existente.sistemaOperativo?.nombre ?? null)
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
    if (sedeNueva) {
      const sede = await tx.sede.findUnique({ where: { id: sedeNueva }, select: { nombre: true } });
      await assetHistoryService.registrar(
        {
          assetId: id,
          tipoEvento: 'actualizacion_specs',
          descripcion: `Sede asignada: ${sede?.nombre ?? sedeNueva} (el equipo no tenía sede)`,
          datosAnteriores: { sedeId: null },
          datosNuevos: { sedeId: sedeNueva, sede: sede?.nombre },
          usuarioSistema: usuario,
        },
        tx
      );
    }

    // La marca no se quita (es obligatoria): si llega vacia, no se toca.
    const { marcaId, ...otrosIds } = await idsDeCatalogos(tx, { ...datos, marca: datos.marca || undefined }, { actual: existente });
    return tx.asset.update({
      where: { id },
      data: {
        ...otrosIds,
        ...(marcaId && { marcaId }),
        ...(datos.categoriaId && { categoriaId: datos.categoriaId }),
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
        ...(datos.imei !== undefined && { imei: datos.imei || null }),
        ...(datos.tieneCargador !== undefined && { tieneCargador: datos.tieneCargador }),
        ...(datos.pulgadas !== undefined && { pulgadas: leerPulgadas(datos.pulgadas) }),
        ...(datos.microsoft365 !== undefined && { microsoft365: datos.microsoft365 }),
        ...(datos.intuneEnrolled !== undefined && { intuneEnrolled: datos.intuneEnrolled }),
        ...(datos.listaDistribucion !== undefined && {
          listaDistribucion: datos.listaDistribucion || null,
        }),
        ...(datos.observaciones !== undefined && { observaciones: datos.observaciones || null }),
        ...(datos.incidencia !== undefined && { incidencia: datos.incidencia || null }),
        ...(datos.nombreEquipo !== undefined && { nombreEquipo: datos.nombreEquipo || null }),
        ...(datos.conectividad !== undefined && { conectividad: datos.conectividad || null }),
        ...(datos.valor !== undefined && { valor: datos.valor }),
        ...(sedeNueva && { sedeId: sedeNueva }),
      },
    });
  });
}

/**
 * Elimina un equipo (DELETE /api/activos/[id]). Con historial o asignaciones
 * no se borra: su registro es evidencia de auditoria (SPEC 2.7.7, ISO 9001
 * 7.5.3); se da de baja, o se descarta si es un duplicado (con motivo). Solo
 * se borra de verdad el ingresado por error que nunca se uso (SPEC 2.130):
 * se van el equipo y su historial, y queda la linea en la auditoria.
 */
export async function eliminarActivo(
  id: string,
  opciones: { descartar: boolean; motivo?: string },
  usuario: string
) {
  const existente = await prisma.asset.findUnique({
    where: { id },
    select: {
      ...MARCA_MODELO,
      estado: true,
      numeroSerie: true,
      deletedAt: true,
      _count: {
        select: {
          assignments: true,
          maintenances: true,
          dispatchItems: true,
          purchaseAssets: true,
          history: { where: { tipoEvento: { notIn: [...EVENTOS_SIN_USO] } } },
        },
      },
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

  const c = existente._count;
  const bloqueo = motivoSinEliminar({
    estado: existente.estado,
    usos: c.assignments + c.maintenances + c.dispatchItems + c.purchaseAssets + c.history,
  });
  if (bloqueo) throw new ConflictError(bloqueo);

  const nombre = `${marcaModelo(existente)} (S/N: ${existente.numeroSerie})`;
  await prisma.$transaction(async (tx) => {
    await tx.assetHistory.deleteMany({ where: { assetId: id } });
    await tx.asset.delete({ where: { id } });
    await auditLogService.registrarEliminacion(
      'activo',
      id,
      `Activo eliminado (ingresado por error): ${nombre}`,
      { marca: existente.marca.nombre, modelo: existente.modelo, numeroSerie: existente.numeroSerie },
      usuario,
      tx
    );
  });
  return { descartado: false };
}
