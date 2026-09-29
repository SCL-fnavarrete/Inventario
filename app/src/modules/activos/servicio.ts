import type { EstadoActivo, Prisma } from '@prisma/client';
import { ConflictError, errorRepetido, ValidationError } from '@/shared/errores';
import { MENSAJE_CAMBIO_SIMULTANEO } from '@/shared/utilidades/concurrencia';
import type { CreateAssetInput } from '@/modules/activos/validaciones';
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
    },
  });

  await assetHistoryService.registrarCreacion(asset, opciones.usuario, tx);
  return asset;
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
