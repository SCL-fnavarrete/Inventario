import type { EstadoActivo, EstadoMantencion, Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, errorDeCampo, NotFoundError, ValidationError } from '@/shared/errores';
import { siSigueIgual } from '@/shared/utilidades/concurrencia';
import { formatearFechaConHora, formatearFechaCorta } from '@/shared/utilidades/fechas';
import { estadoTrasMantencion, motivoSinBaja, motivoSinEsperaDeRepuestos, motivoSinMantencion, validateTransition, CON_CATALOGOS, NOMBRE } from '@/modules/activos';
import { assetHistoryService, cambiarEstado } from '@/modules/activos/servidor';
import { auditLogService } from '@/shared/auditoria';
import { mantencionACerrar } from '@/modules/mantenciones/utilidades';
import { motivoParaBaja } from '@/modules/mantenciones/motivosBaja';
import { etiquetaResultadoMantencion } from '@/modules/mantenciones/resultados';
import type {
  BajaEquipoDatos,
  CompleteMaintenanceInput,
  CreateMaintenanceInput,
  UpdateMaintenanceInput,
} from '@/modules/mantenciones/validaciones';
import type { PrismaTx } from '@/modules/activos/servidor';

/**
 * Lo que una mantencion le hace al estado del equipo (SPEC 2.96). Programar
 * no lo cambia; Iniciar lo pasa a "En Mantención"; Completar como Reparado o
 * Cancelar la que esta en proceso lo devuelven a su estado de uso. Estas
 * funciones son el unico lugar que decide ese regreso.
 */

type ActivoEnMantencion = {
  id: string;
  estado: EstadoActivo;
  empleadoActualId: string | null;
};

/**
 * Deja en el historial el cierre de una mantencion y, si era la que estaba
 * en proceso (devolverEquipo) y el equipo sigue en mantencion, lo devuelve a
 * su estado de uso. Una pendiente nunca movio al equipo: cerrarla no lo toca,
 * aunque otra mantencion lo tenga en mantencion. Devuelve el estado nuevo,
 * o null si el equipo no cambio.
 */
export async function registrarSalidaDeMantencion(
  tx: PrismaTx,
  datos: {
    asset: ActivoEnMantencion;
    maintenanceId: string;
    descripcion: string;
    usuario: string;
    devolverEquipo: boolean;
    extra?: Prisma.JsonObject;
  }
): Promise<EstadoActivo | null> {
  const { asset } = datos;
  const nuevoEstado =
    datos.devolverEquipo && asset.estado === 'en_mantencion' ? estadoTrasMantencion(asset) : null;

  if (nuevoEstado) {
    await cambiarEstado(tx, { activo: { id: asset.id, estado: 'en_mantencion' }, a: nuevoEstado });
  }

  await assetHistoryService.registrar(
    {
      assetId: asset.id,
      tipoEvento: 'mantencion',
      descripcion: datos.descripcion,
      datosAnteriores: nuevoEstado ? { estado: asset.estado } : undefined,
      datosNuevos: {
        ...(nuevoEstado ? { estado: nuevoEstado } : {}),
        maintenanceId: datos.maintenanceId,
        ...datos.extra,
      },
      usuarioSistema: datos.usuario,
    },
    tx
  );

  return nuevoEstado;
}

/**
 * Un equipo dado de baja no queda con otras mantenciones abiertas: se
 * cancelan, dejando el motivo.
 */
export async function cancelarAbiertasPorBaja(tx: PrismaTx, assetId: string, exceptoId?: string) {
  await tx.maintenance.updateMany({
    where: {
      assetId,
      estado: { in: ['pendiente', 'en_proceso'] },
      ...(exceptoId ? { id: { not: exceptoId } } : {}),
    },
    data: { estado: 'cancelada', resultado: 'Cancelada: el equipo se dio de baja' },
  });
}

/**
 * Tipo de mantencion para lo que no viene de una programada: "Correctiva", o
 * el primer tipo activo si ese no existe. Lo usan la devolucion dañada
 * (SPEC 2.87) y el equipo perdido en un despacho (SPEC 2.108).
 */
export async function tipoCorrectivaPorDefecto(tx: PrismaTx) {
  return (
    (await tx.maintenanceType.findFirst({ where: { nombre: 'Correctiva', activo: true } })) ??
    (await tx.maintenanceType.findFirst({ where: { activo: true }, orderBy: { nombre: 'asc' } }))
  );
}

/**
 * Tipo de las mantenciones que trae un Excel importado: el Excel no dice el
 * tipo, asi que quedan como "Preventiva" (se crea una sola vez si no existe).
 */
export async function tipoMantencionImportada() {
  return prisma.maintenanceType.upsert({
    where: { nombre: 'Preventiva' },
    update: {},
    create: { nombre: 'Preventiva' },
    select: { id: true },
  });
}

/**
 * Dar de baja un equipo (SPEC 2.140), dentro de una transaccion ya abierta. Sin
 * mantencion de por medio: el equipo pasa a Baja con su motivo y su fecha, queda
 * en su historial y en la auditoria, y sus mantenciones abiertas se cancelan.
 * Quien llama ya reviso motivoSinBaja; la transicion la valida cambiarEstado.
 * La usan la baja del detalle del equipo y el equipo perdido en una guia.
 */
export async function bajaEnTransaccion(
  tx: PrismaTx,
  datos: {
    asset: { id: string; estado: EstadoActivo; marca: { nombre: string }; modelo: string; condicion: string };
    /** De motivoParaBaja: el motivo de la lista y su texto (SPEC 2.116.5). */
    motivoBajaId: string;
    motivoTexto: string;
    fechaBaja: Date;
    observaciones?: string | null;
    usuario: string;
  }
) {
  const { asset, motivoTexto, usuario } = datos;
  const obs = datos.observaciones?.trim();
  await cambiarEstado(tx, {
    activo: asset,
    a: 'baja',
    contexto: { motivo: motivoTexto },
    datos: { fechaBaja: datos.fechaBaja, motivoBajaId: datos.motivoBajaId, motivoBaja: motivoTexto },
    exigir: { empleadoActualId: null },
    historial: {
      tipoEvento: 'baja',
      descripcion: `Activo dado de baja: ${motivoTexto}${obs ? ` (${obs})` : ''}`,
      datosAnteriores: { estado: asset.estado },
      datosNuevos: {
        estado: 'baja',
        motivo: motivoTexto,
        condicionFinal: asset.condicion,
        fechaBaja: datos.fechaBaja.toISOString(),
        ...(obs && { observaciones: obs }),
      },
      usuarioSistema: usuario,
    },
  });
  await cancelarAbiertasPorBaja(tx, asset.id);
  await auditLogService.registrarActualizacion(
    'activo',
    asset.id,
    `${asset.marca.nombre} ${asset.modelo} dado de baja: ${motivoTexto}`,
    { estado: asset.estado },
    { estado: 'baja', motivoBaja: motivoTexto },
    usuario,
    tx
  );
}

type MantencionAbierta = { id: string; estado: EstadoMantencion; tipo: { id: string; nombre: string } };

/**
 * Completar una mantencion como "Sin reparación" (SPEC 2.88): cierra esa
 * mantencion y, como el equipo no se arregla, lo da de baja con su motivo. Es
 * lo unico que une la baja con una mantencion: dar de baja un equipo sin mas
 * es `bajaEnTransaccion` (SPEC 2.140). Las demas abiertas se cancelan.
 * Quien llama ya reviso motivoSinBaja; la transicion la valida cambiarEstado.
 */
export async function darDeBajaEnTransaccion(
  tx: PrismaTx,
  datos: {
    asset: {
      id: string;
      estado: EstadoActivo;
      marca: { nombre: string };
      modelo: string;
      condicion: string;
      maintenances: MantencionAbierta[];
    };
    /** Tipo si no hay mantencion abierta que cerrar. */
    tipo: { id: string; nombre: string };
    /** De motivoParaBaja: el motivo de la lista y su texto (SPEC 2.116.5). */
    motivoBajaId: string;
    motivoTexto: string;
    resultado: string;
    fechaRealizada: Date;
    realizadoPor: string;
    usuario: string;
    /** Descripcion de la mantencion nueva si no habia una abierta. */
    descripcion?: string;
    /** Costo, si se completa desde el detalle de la mantencion. */
    costo?: number | null;
  }
) {
  const { asset, motivoTexto, usuario } = datos;
  const abierta = mantencionACerrar(asset.maintenances);
  const tipo = abierta ? abierta.tipo : datos.tipo;
  const cierre = {
    estado: 'completada' as const,
    fechaRealizada: datos.fechaRealizada,
    realizadoPor: datos.realizadoPor,
    resultado: datos.resultado,
    resultadoTipo: 'no_reparable',
    motivoBajaId: datos.motivoBajaId,
    motivoBaja: motivoTexto,
    costo: datos.costo,
  };

  // Cada escritura exige el estado que se leyo (siSigueIgual): una baja
  // simultanea con una entrega u otra baja responde 409 (7.A-1).
  const m = abierta
    ? await siSigueIgual(
        tx.maintenance.update({ where: { id: abierta.id, estado: abierta.estado }, data: cierre })
      )
    : await tx.maintenance.create({
        data: {
          assetId: asset.id,
          tipoId: tipo.id,
          descripcion: datos.descripcion ?? `Dar de baja: ${motivoTexto}`,
          fechaProgramada: datos.fechaRealizada,
          ...cierre,
        },
      });

  // Un equipo de baja no queda con otras mantenciones pendientes.
  await cancelarAbiertasPorBaja(tx, asset.id, m.id);

  await cambiarEstado(tx, {
    activo: asset,
    a: 'baja',
    contexto: { motivo: motivoTexto },
    datos: { fechaBaja: datos.fechaRealizada, motivoBajaId: datos.motivoBajaId, motivoBaja: motivoTexto },
    exigir: { empleadoActualId: null },
  });

  await assetHistoryService.registrarBaja(
    asset.id,
    `Mantención ${tipo.nombre}: ${motivoTexto}`,
    asset.condicion,
    usuario,
    tx
  );

  if (abierta) {
    await auditLogService.registrarActualizacion(
      'mantencion',
      m.id,
      `Mantención ${tipo.nombre} cerrada como Sin reparación: ${asset.marca.nombre} ${asset.modelo} dado de baja`,
      { estado: abierta.estado },
      { estado: 'completada', resultadoTipo: 'no_reparable', motivoBaja: motivoTexto },
      usuario,
      tx
    );
  } else {
    await auditLogService.registrarCreacion(
      'mantencion',
      m.id,
      `Mantención de baja: ${tipo.nombre} para ${asset.marca.nombre} ${asset.modelo}`,
      { assetId: asset.id, tipoId: tipo.id, resultadoTipo: 'no_reparable', motivoBaja: motivoTexto },
      usuario,
      tx
    );
  }

  return m;
}

/* ------------------------------------------------------------------------
 * Acciones sobre una mantencion (SPEC 2.96). Las rutas de
 * /api/mantenciones/[id] solo validan la peticion y llaman a estas.
 * --------------------------------------------------------------------- */

/** Lo que devuelven las acciones: la mantencion con su tipo y su equipo. */
const CON_DETALLE = { tipo: true, asset: { include: { ...CON_CATALOGOS, categoria: true } } } as const;

async function buscarMantencion(id: string) {
  const m = await prisma.maintenance.findUnique({
    where: { id },
    include: { asset: { include: { marca: NOMBRE } }, tipo: true },
  });
  if (!m) throw new NotFoundError('Mantención no encontrada');
  return m;
}

/** Una mantencion cerrada (completada o cancelada) ya no se toca. */
async function buscarAbierta(id: string) {
  const m = await buscarMantencion(id);
  if (m.estado === 'completada' || m.estado === 'cancelada') {
    throw new ConflictError('No se puede modificar una mantención completada o cancelada');
  }
  return m;
}

/**
 * Iniciar: el equipo pasa a "En Mantención" recien ahora, y solo puede haber
 * una mantencion en proceso por equipo.
 */
export async function iniciarMantencion(id: string, usuario: string) {
  const existente = await buscarAbierta(id);
  const { asset } = existente;
  if (existente.estado !== 'pendiente') throw new ConflictError('La mantención ya está en proceso');
  if (asset.deletedAt) {
    throw new ConflictError('Este activo está descartado y no admite movimientos');
  }
  const bloqueo = motivoSinMantencion(asset.estado);
  if (bloqueo) throw new ConflictError(bloqueo);

  const otraEnProceso = await prisma.maintenance.findFirst({
    where: { assetId: asset.id, estado: 'en_proceso', id: { not: id } },
    select: { tipo: { select: { nombre: true } } },
  });
  if (otraEnProceso) {
    throw new ConflictError(
      `Este equipo ya tiene una mantención ${otraEnProceso.tipo.nombre} en proceso. Complétala o cancélala antes de iniciar otra.`
    );
  }

  const contexto = { hasActiveAssignment: !!asset.empleadoActualId, hasActiveMaintenance: true };
  const cambiaEstado = asset.estado !== 'en_mantencion';
  if (cambiaEstado) {
    const transicion = validateTransition(asset.estado, 'en_mantencion', contexto);
    if (!transicion.valid) {
      throw new ValidationError('Transición de estado no permitida', transicion.errors);
    }
  }

  return prisma.$transaction(async (tx) => {
    // Mantencion y equipo solo si siguen como se leyeron: iniciar dos veces,
    // o a la vez que una entrega, responde 409 (7.A-1).
    const actualizada = await siSigueIgual(
      tx.maintenance.update({
        where: { id, estado: 'pendiente' },
        data: { estado: 'en_proceso' },
        include: CON_DETALLE,
      })
    );
    if (cambiaEstado) await cambiarEstado(tx, { activo: asset, a: 'en_mantencion', contexto });

    await assetHistoryService.registrar(
      {
        assetId: asset.id,
        tipoEvento: 'mantencion',
        descripcion: `Mantención ${existente.tipo.nombre} iniciada: ${existente.descripcion}`,
        datosAnteriores: cambiaEstado ? { estado: asset.estado } : undefined,
        datosNuevos: { ...(cambiaEstado ? { estado: 'en_mantencion' } : {}), maintenanceId: id },
        usuarioSistema: usuario,
      },
      tx
    );
    await auditLogService.registrarActualizacion(
      'mantencion',
      id,
      `Mantención iniciada: ${existente.tipo.nombre} para ${asset.marca.nombre} ${asset.modelo}`,
      { estado: existente.estado },
      { estado: 'en_proceso' },
      usuario,
      tx
    );
    return actualizada;
  });
}

/**
 * Cancelar: si era la que estaba en proceso, el equipo vuelve a su estado de
 * uso; una pendiente nunca lo habia movido.
 */
export async function cancelarMantencion(id: string, motivo: string | undefined, usuario: string) {
  const existente = await buscarAbierta(id);
  const { asset } = existente;
  return prisma.$transaction(async (tx) => {
    const actualizada = await siSigueIgual(
      tx.maintenance.update({
        where: { id, estado: existente.estado },
        data: { estado: 'cancelada', ...(motivo ? { resultado: motivo } : {}) },
        include: CON_DETALLE,
      })
    );
    await registrarSalidaDeMantencion(tx, {
      asset,
      maintenanceId: id,
      descripcion: `Mantención ${existente.tipo.nombre} cancelada${motivo ? `: ${motivo}` : ''}`,
      usuario,
      devolverEquipo: existente.estado === 'en_proceso',
    });
    await auditLogService.registrarActualizacion(
      'mantencion',
      id,
      `Mantención cancelada: ${existente.tipo.nombre} para ${asset.marca.nombre} ${asset.modelo}`,
      { estado: existente.estado },
      { estado: 'cancelada', resultado: motivo ?? null },
      usuario,
      tx
    );
    return actualizada;
  });
}

/**
 * Editar: solo una mantencion pendiente (tipo, fecha, descripcion, tecnico,
 * costo estimado, proveedor). Cambiar la fecha queda en el historial del
 * equipo: es lo que se mira para saber cuando le toca.
 */
export async function editarMantencion(id: string, data: UpdateMaintenanceInput, usuario: string) {
  const existente = await buscarAbierta(id);
  const { asset } = existente;
  if (existente.estado !== 'pendiente') {
    throw new ConflictError('Solo se puede editar una mantención pendiente');
  }

  let tipoNombre = existente.tipo.nombre;
  if (data.tipoId && data.tipoId !== existente.tipoId) {
    const tipo = await prisma.maintenanceType.findUnique({ where: { id: data.tipoId } });
    if (!tipo) throw new NotFoundError('Tipo de mantención no encontrado');
    tipoNombre = tipo.nombre;
  }

  return prisma.$transaction(async (tx) => {
    // Solo se edita si sigue pendiente (otra persona pudo iniciarla).
    const actualizada = await siSigueIgual(
      tx.maintenance.update({
        where: { id, estado: 'pendiente' },
        data: {
          tipoId: data.tipoId,
          descripcion: data.descripcion,
          fechaProgramada: data.fechaProgramada,
          horaProgramada: data.horaProgramada,
          realizadoPor: data.realizadoPor,
          costo: data.costo,
          proveedorExterno: data.proveedorExterno,
        },
        include: CON_DETALLE,
      })
    );

    const cambiaFecha =
      (data.fechaProgramada !== undefined &&
        data.fechaProgramada.getTime() !== existente.fechaProgramada?.getTime()) ||
      (data.horaProgramada !== undefined && data.horaProgramada !== existente.horaProgramada);
    if (cambiaFecha) {
      await assetHistoryService.registrar(
        {
          assetId: asset.id,
          tipoEvento: 'mantencion',
          descripcion: `Mantención ${tipoNombre} reprogramada del ${formatearFechaConHora(existente.fechaProgramada, existente.horaProgramada)} al ${formatearFechaConHora(actualizada.fechaProgramada, actualizada.horaProgramada)}`,
          datosNuevos: { maintenanceId: id },
          usuarioSistema: usuario,
        },
        tx
      );
    }

    const campos = (m: typeof existente | typeof actualizada) => ({
      tipoId: m.tipoId,
      descripcion: m.descripcion,
      fechaProgramada: m.fechaProgramada,
      horaProgramada: m.horaProgramada,
      realizadoPor: m.realizadoPor,
    });
    await auditLogService.registrarActualizacion(
      'mantencion',
      id,
      `Mantención editada: ${tipoNombre} para ${asset.marca.nombre} ${asset.modelo}`,
      campos(existente),
      campos(actualizada),
      usuario,
      tx
    );
    return actualizada;
  });
}

/**
 * Eliminar: solo una mantencion pendiente. Una pendiente no cambio el estado
 * del equipo, asi que borrarla no lo toca.
 */
export async function eliminarMantencion(id: string, usuario: string) {
  const m = await buscarMantencion(id);
  if (m.estado !== 'pendiente') {
    throw new ConflictError('Solo se pueden eliminar mantenciones pendientes');
  }
  await prisma.$transaction(async (tx) => {
    // Registro de auditoria antes del delete fisico.
    await auditLogService.registrarEliminacion(
      'mantencion',
      m.id,
      `Mantención eliminada: ${m.tipo.nombre} para ${m.asset.marca.nombre} ${m.asset.modelo}`,
      { assetId: m.assetId, estado: m.estado },
      usuario,
      tx
    );
    await tx.maintenance.delete({ where: { id } });
    await assetHistoryService.registrar(
      {
        assetId: m.assetId,
        tipoEvento: 'mantencion',
        descripcion: `Mantención ${m.tipo.nombre} programada para el ${formatearFechaConHora(m.fechaProgramada, m.horaProgramada)} eliminada`,
        usuarioSistema: usuario,
      },
      tx
    );
  });
}

/**
 * Completar la mantencion en proceso (SPEC 2.96); una pendiente primero se
 * inicia, que es cuando el equipo entra a mantencion. Segun el resultado:
 * - Faltan repuestos: sigue en proceso con la nota; el equipo sigue en mantencion.
 * - Sin reparacion: cierra la mantencion y da de baja el equipo con su motivo (SPEC 2.88).
 * - Reparado: el equipo vuelve a servicio y, si se indica, queda programada
 *   la proxima.
 */
export async function completarMantencion(
  id: string,
  data: CompleteMaintenanceInput,
  usuario: string
) {
  const m = await buscarMantencion(id);
  const { asset, tipo } = m;
  if (m.estado === 'completada') throw new ConflictError('La mantención ya está completada');
  if (m.estado === 'cancelada') {
    throw new ConflictError('No se puede completar una mantención cancelada');
  }
  if (m.estado !== 'en_proceso') {
    throw new ConflictError('Primero inicia la mantención: el equipo entra a mantención al iniciarla');
  }

  if (data.resultadoTipo === 'pendiente_repuestos') {
    const bloqueoRepuestos = motivoSinEsperaDeRepuestos(asset);
    if (bloqueoRepuestos) throw new ConflictError(bloqueoRepuestos);
    return prisma.$transaction(async (tx) => {
      const actualizada = await siSigueIgual(
        tx.maintenance.update({
          where: { id, estado: 'en_proceso' },
          data: {
            realizadoPor: data.realizadoPor,
            resultado: data.resultado,
            resultadoTipo: data.resultadoTipo,
            costo: data.costo,
          },
          include: CON_DETALLE,
        })
      );
      await assetHistoryService.registrar(
        {
          assetId: m.assetId,
          tipoEvento: 'mantencion',
          descripcion: `Mantención ${tipo.nombre} en espera de repuestos: ${data.resultado}`,
          datosNuevos: { maintenanceId: id, resultadoTipo: data.resultadoTipo },
          usuarioSistema: usuario,
        },
        tx
      );
      await auditLogService.registrarActualizacion(
        'mantencion',
        id,
        `Mantención en espera de repuestos: ${tipo.nombre}`,
        { resultadoTipo: m.resultadoTipo, resultado: m.resultado },
        { resultadoTipo: data.resultadoTipo, resultado: data.resultado },
        usuario,
        tx
      );
      return actualizada;
    });
  }

  if (data.resultadoTipo === 'no_reparable') {
    // Regla unica de la baja (SPEC 2.106): solo un equipo sin empleado.
    const bloqueo = motivoSinBaja(asset);
    if (bloqueo) throw new ConflictError(bloqueo);
    // Motivo de la lista (SPEC 2.116.5): "Robo" o "Otro: detalle".
    const { motivoBajaId, motivoTexto } = await motivoParaBaja(
      prisma,
      { id: data.motivoBajaId! },
      data.motivoDetalle
    );
    // Cierra esta misma mantencion, que es la que esta en proceso.
    return prisma.$transaction((tx) =>
      darDeBajaEnTransaccion(tx, {
        asset: { ...asset, maintenances: [{ id: m.id, estado: m.estado, tipo }] },
        tipo,
        motivoBajaId,
        motivoTexto,
        resultado: data.resultado,
        fechaRealizada: data.fechaRealizada,
        realizadoPor: data.realizadoPor,
        usuario,
        costo: data.costo,
      })
    );
  }

  // Reparado: vuelve a servicio (asignado si tiene dueño, si no disponible).
  return prisma.$transaction(async (tx) => {
    // Solo si sigue en proceso: un doble envio desde dos pestañas ya no la
    // completa dos veces (7.A-1).
    const actualizada = await siSigueIgual(
      tx.maintenance.update({
        where: { id, estado: 'en_proceso' },
        data: {
          estado: 'completada',
          fechaRealizada: data.fechaRealizada,
          realizadoPor: data.realizadoPor,
          resultado: data.resultado,
          resultadoTipo: data.resultadoTipo,
          costo: data.costo,
          proximaMantencion: data.proximaMantencion,
        },
        include: CON_DETALLE,
      })
    );
    await registrarSalidaDeMantencion(tx, {
      asset,
      maintenanceId: id,
      descripcion: `Mantención ${tipo.nombre} realizada el ${formatearFechaCorta(data.fechaRealizada)}: ${etiquetaResultadoMantencion(data.resultadoTipo)}. ${data.resultado}`,
      usuario,
      devolverEquipo: true,
      extra: { resultado: data.resultado, resultadoTipo: data.resultadoTipo, costo: data.costo ?? null },
    });

    // Proxima mantencion: queda programada, pendiente, con el mismo tipo.
    if (data.proximaMantencion) {
      const descripcion = `Siguiente a la mantención ${tipo.nombre} del ${formatearFechaCorta(data.fechaRealizada)}`;
      const siguiente = await tx.maintenance.create({
        data: {
          assetId: m.assetId,
          tipoId: m.tipoId,
          descripcion,
          fechaProgramada: data.proximaMantencion,
          estado: 'pendiente',
        },
      });
      await assetHistoryService.registrar(
        {
          assetId: m.assetId,
          tipoEvento: 'mantencion',
          descripcion: `Mantención ${tipo.nombre} programada para el ${formatearFechaCorta(data.proximaMantencion)}: ${descripcion}`,
          datosNuevos: { maintenanceId: siguiente.id },
          usuarioSistema: usuario,
        },
        tx
      );
    }

    await auditLogService.registrarActualizacion(
      'mantencion',
      id,
      `Mantención completada: ${tipo.nombre} (${etiquetaResultadoMantencion(data.resultadoTipo)})`,
      { estado: m.estado },
      { estado: 'completada', resultadoTipo: data.resultadoTipo, resultado: data.resultado },
      usuario,
      tx
    );
    return actualizada;
  });
}

/**
 * Programar una mantencion (POST /api/mantenciones). No cambia el estado del
 * equipo (SPEC 2.96): pasa a "En Mantención" recien al iniciarla. Solo se
 * rechaza el equipo que no admite mantenciones, con el motivo en palabras.
 */
export async function programarMantencion(data: CreateMaintenanceInput, usuario: string | null | undefined) {
  const asset = await prisma.asset.findUnique({ where: { id: data.assetId }, include: { marca: NOMBRE } });
  if (!asset) throw new NotFoundError('Activo no encontrado');
  // Tipo del catalogo (Mantenciones > Tipos).
  const tipo = await prisma.maintenanceType.findUnique({ where: { id: data.tipoId } });
  if (!tipo) throw new NotFoundError('Tipo de mantención no encontrado');
  if (asset.deletedAt) throw new ConflictError('Este activo está descartado y no admite movimientos');
  const bloqueo = motivoSinMantencion(asset.estado);
  if (bloqueo) throw errorDeCampo('assetId', bloqueo);

  return prisma.$transaction(async (tx) => {
    const mantencion = await tx.maintenance.create({
      data: {
        assetId: data.assetId,
        tipoId: data.tipoId,
        descripcion: data.descripcion,
        fechaProgramada: data.fechaProgramada,
        horaProgramada: data.horaProgramada,
        proximaMantencion: data.proximaMantencion,
        realizadoPor: data.realizadoPor,
        costo: data.costo,
        proveedorExterno: data.proveedorExterno,
        estado: 'pendiente',
      },
      include: { tipo: true, asset: { include: { ...CON_CATALOGOS, categoria: true } } },
    });
    await auditLogService.registrarCreacion(
      'mantencion',
      mantencion.id,
      `Mantención creada: ${mantencion.tipo.nombre} para ${asset.marca.nombre} ${asset.modelo}`,
      { assetId: data.assetId, tipoId: data.tipoId, descripcion: data.descripcion, estado: mantencion.estado },
      usuario,
      tx
    );
    // Historial del equipo, sin cambio de estado.
    await assetHistoryService.registrar(
      {
        assetId: data.assetId,
        tipoEvento: 'mantencion',
        descripcion: `Mantención ${mantencion.tipo.nombre} programada para el ${formatearFechaConHora(data.fechaProgramada, data.horaProgramada)}: ${data.descripcion}`,
        datosNuevos: { maintenanceId: mantencion.id },
        usuarioSistema: usuario || data.realizadoPor || 'Sistema',
      },
      tx
    );
    return mantencion;
  });
}

/**
 * Dar de baja un equipo (POST /api/activos/[id]/baja, SPEC 2.140): sin
 * mantencion, con su motivo de la lista y su fecha. Solo un equipo sin empleado
 * asignado (SPEC 2.106).
 */
export async function darDeBajaEquipo(assetId: string, data: BajaEquipoDatos, usuario: string) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId }, include: { marca: NOMBRE } });
  if (!asset) throw new NotFoundError('Activo no encontrado');
  if (asset.deletedAt) throw new ConflictError('Este activo esta descartado y no admite movimientos');
  // Regla unica de la baja (SPEC 2.106): solo un equipo sin empleado asignado.
  const bloqueo = motivoSinBaja(asset);
  if (bloqueo) throw new ConflictError(bloqueo);

  // Motivo de la lista (SPEC 2.116.5): "Robo" o "Otro: detalle".
  const { motivoBajaId, motivoTexto } = await motivoParaBaja(prisma, { id: data.motivoBajaId }, data.motivoDetalle);
  await prisma.$transaction((tx) =>
    bajaEnTransaccion(tx, {
      asset,
      motivoBajaId,
      motivoTexto,
      fechaBaja: data.fechaBaja,
      observaciones: data.observaciones,
      usuario,
    })
  );
  return { assetId: asset.id };
}

/**
 * Mantencion historica que trae un Excel importado (ya realizada o
 * programada), con los datos que arma la importacion fila por fila.
 */
export function registrarMantencionImportada(tx: PrismaTx, datos: Prisma.MaintenanceUncheckedCreateInput) {
  return tx.maintenance.create({ data: datos });
}
