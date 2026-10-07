import { Prisma } from '@prisma/client';
import type { CondicionCargador } from '@/modules/activos';
import { ConflictError, NotFoundError } from '@/shared/errores';
import { formatearClp } from '@/shared/utilidades/moneda';
import { etiquetaEstadoActivo, etiquetaEstadoDevolucion } from '@/modules/activos';
import { cambiarEstado } from '@/modules/activos/servidor';
import { cancelarAbiertasPorBaja, motivoParaBaja } from '@/modules/mantenciones/servidor';

/**
 * Entregar y devolver un equipo (SPEC 2.118: Asignaciones es el unico que
 * escribe asignaciones). Lo usan Activos > Asignaciones y las Solicitudes.
 */

type PrismaTx = Prisma.TransactionClient;

export type ExecuteAssignmentParams = {
  assetId: string;
  employeeId: string;
  fechaEntrega: Date;
  lugarEntrega?: string | null;
  entregadoPor?: string | null;
  // Usuario de quien lo hace, para el historial (SPEC 2.122); el nombre va en entregadoPor.
  usuarioSistema?: string | null;
  tipoMovimiento: 'ingreso' | 'cambio' | 'reemplazo' | 'temporal';
  motivo?: string | null;
  // Nombre de red del equipo (hostname). Se define al entregar, no al crear
  // el activo, porque se arma con el nombre de quien lo va a usar. Si no
  // viene, el activo conserva el que ya tenia.
  nombreEquipo?: string | null;
  // Condicion del cargador al momento de la entrega -- solo se usa si el
  // activo es un notebook con tieneCargador = true; para el resto se
  // ignora silenciosamente. No es un activo propio, no afecta el estado
  // del Activo.
  condicionCargadorEntrega?: CondicionCargador | null;
  observacionesCargador?: string | null;
  // Sede en que ocurre la entrega (la de la solicitud o la del empleado).
  // Un equipo de otra sede se rechaza como inexistente: se traslada con un
  // despacho, no se entrega directo (SPEC 2.8.3, 2.114).
  sedeId: string | null;
};

export type ExecuteReturnParams = {
  assignmentId: string;
  fechaDevolucion: Date;
  recibidoPor?: string | null;
  // Usuario de quien lo hace, para el historial (SPEC 2.122); el nombre va en recibidoPor.
  usuarioSistema?: string | null;
  estadoDevolucion: 'ok' | 'danado' | 'incompleto' | 'no_devuelto' | 'baja';
  // Con estadoDevolucion 'danado' o 'baja' (SPEC 2.135): el motivo de la lista
  // (obligatorio) y, si es "Otro", su detalle.
  motivoBaja?: { id: string; detalle?: string | null };
  observacionesDevolucion?: string | null;
  // Condicion del cargador al momento de la devolucion -- mismo criterio
  // que condicionCargadorEntrega en ExecuteAssignmentParams: solo se usa
  // si el activo es un notebook con tieneCargador = true, para el resto se
  // ignora en silencio.
  condicionCargadorDevolucion?: CondicionCargador | null;
  observacionesCargador?: string | null;
  // Si se pasa, se exige que la asignacion sea de este empleado -- evita que
  // un offboarding/cambio de equipo de una persona devuelva por error (o a
  // proposito, via API directa) el equipo de otra.
  expectedEmployeeId?: string;
  // Donde ocurre la devolucion, para el texto del historial cuando el
  // equipo no se devuelve. Por defecto, una desvinculacion.
  contexto?: 'desvinculacion' | 'cambio';
};

/**
 * Creates an assignment and updates the asset state. Reusable from both
 * Activos > Asignaciones and the Solicitudes.
 */
export async function executeAssignment(
  tx: PrismaTx,
  params: ExecuteAssignmentParams
) {
  const asset = await tx.asset.findUnique({
    where: { id: params.assetId },
    include: { categoria: true },
  });

  // Un equipo de otra sede se trata como inexistente (auditoria 27-sep-2026,
  // A01-1): antes un tecnico podia entregar uno ajeno poniendo su id en la
  // transicion de la solicitud.
  if (!asset || asset.sedeId !== params.sedeId) throw new NotFoundError('Activo no encontrado');
  // "disponible" es el unico estado asignable.
  if (asset.estado !== 'disponible') {
    throw new ConflictError(`El activo no está disponible. Estado actual: ${etiquetaEstadoActivo(asset.estado)}`);
  }

  const employee = await tx.employee.findUnique({
    where: { id: params.employeeId },
  });

  if (!employee) throw new NotFoundError('Empleado no encontrado');
  if (employee.estado !== 'activo')
    throw new ConflictError(
      `No se puede entregar equipo a ${employee.nombres} ${employee.apellidoPaterno}: su estado es "${employee.estado}"`
    );

  // Solo se guarda si el activo realmente es un notebook con cargador --
  // si se manda por error para otra categoria (o un notebook sin cargador),
  // se ignora en silencio en vez de dejar un dato sin sentido en el acta.
  const aplicaCargador = asset.tieneCargador;

  // Se "reclama" el equipo con una condicion sobre su estado: si otra entrega
  // simultanea ya lo tomo, esta no encuentra la fila y se rechaza. Antes se
  // leia "disponible" y se escribia sin condicion, y dos entregas a la vez
  // dejaban dos asignaciones activas del mismo equipo (R2).
  await cambiarEstado(tx, {
    activo: { id: params.assetId, estado: 'disponible' },
    a: 'asignado',
    datos: {
      empleadoActualId: params.employeeId,
      // Solo se pisa si la entrega trae un nombre: si el tecnico lo dejo en
      // blanco, el equipo conserva el que ya tenia.
      ...(params.nombreEquipo ? { nombreEquipo: params.nombreEquipo } : {}),
    },
    mensajeConflicto: 'El equipo ya fue entregado o cambió de estado. Recarga la lista y elige otro.',
    historial: {
      tipoEvento: 'asignacion',
      descripcion: `Asignado a ${employee.nombres} ${employee.apellidoPaterno} (${employee.rut || '—'})`,
      datosAnteriores: { estado: asset.estado, empleadoActualId: asset.empleadoActualId },
      datosNuevos: { estado: 'asignado', empleadoActualId: params.employeeId },
      usuarioSistema: params.usuarioSistema || params.entregadoPor || 'Sistema',
    },
  });

  const assignment = await tx.assignment.create({
    data: {
      assetId: params.assetId,
      employeeId: params.employeeId,
      fechaEntrega: params.fechaEntrega,
      lugarEntrega: params.lugarEntrega,
      entregadoPor: params.entregadoPor,
      tipoMovimiento: params.tipoMovimiento,
      motivo: params.motivo,
      activo: true,
      ...(aplicaCargador && {
        condicionCargadorEntrega: params.condicionCargadorEntrega || null,
        observacionesCargadorEntrega: params.observacionesCargador || null,
      }),
    },
    include: {
      asset: { include: { categoria: true } },
      employee: true,
    },
  });

  return assignment;
}

/**
 * Processes a single assignment return.
 */
export async function executeReturn(tx: PrismaTx, params: ExecuteReturnParams) {
  const assignment = await tx.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { asset: true, employee: true },
  });

  if (!assignment) throw new NotFoundError('Asignación no encontrada');
  const quien = params.usuarioSistema || params.recibidoPor || 'Sistema';

  if (params.expectedEmployeeId && assignment.employeeId !== params.expectedEmployeeId) {
    throw new ConflictError('Ese equipo no está asignado a este empleado');
  }

  // Evita devolver dos veces el mismo equipo, lo que sobreescribiria la
  // fecha y el estado de la primera devolucion. Un "no_devuelto" deja la
  // asignacion activa a proposito (ver abajo), asi que sigue pudiendose
  // calificar de nuevo cuando el equipo aparece.
  if (!assignment.activo) throw new ConflictError('Esta asignación ya fue devuelta');

  // "no_devuelto": el empleado no entrego el equipo, asi que no hay
  // devolucion fisica que registrar -- la asignacion no se cierra (sigue
  // activa) y el Activo sigue vinculado al mismo empleado. El Activo pasa a
  // su propio estado "no_devuelto" (ver modules/activos/maquinaEstados.ts), y desde ahi
  // puede volver a "disponible" o pasar a "baja" cuando el equipo aparece.
  // Igual que en executeAssignment: solo se guarda el cargador si el
  // activo realmente es un notebook con cargador.
  const aplicaCargadorDevolucion = assignment.asset.tieneCargador;

  if (params.estadoDevolucion === 'no_devuelto') {
    const actualizada = await tx.assignment.update({
      where: { id: params.assignmentId },
      data: {
        recibidoPor: params.recibidoPor,
        estadoDevolucion: params.estadoDevolucion,
        observacionesDevolucion: params.observacionesDevolucion,
        // El valor del equipo en este momento, para RRHH (SPEC 2.124): no
        // cambia aunque despues se actualice el del activo.
        valorNoDevuelto: assignment.asset.valor ?? null,
        ...(aplicaCargadorDevolucion && {
          condicionCargadorDevolucion: params.condicionCargadorDevolucion || null,
          observacionesCargadorDevolucion: params.observacionesCargador || null,
        }),
      },
      include: {
        asset: { include: { categoria: true } },
        employee: true,
      },
    });

    const valor = assignment.asset.valor ?? null;
    const descripcion = `${assignment.employee.nombres} ${assignment.employee.apellidoPaterno} no devolvió el equipo ${params.contexto === 'cambio' ? 'en el cambio de equipo' : 'en su desvinculación'}. Queda "No devuelto", a la espera de recuperarlo.${valor !== null ? ` Valor al no devolverse: ${formatearClp(valor)}.` : ''}`;
    await cambiarEstado(tx, {
      activo: assignment.asset,
      a: 'no_devuelto',
      contexto: { hasActiveAssignment: true, motivo: descripcion },
      historial: {
        tipoEvento: 'devolucion',
        descripcion,
        datosAnteriores: {
          estado: assignment.asset.estado,
          empleadoActualId: assignment.asset.empleadoActualId,
        },
        datosNuevos: {
          estado: 'no_devuelto',
          empleadoActualId: assignment.asset.empleadoActualId,
          estadoDevolucion: params.estadoDevolucion,
          valor,
        },
        usuarioSistema: quien,
      },
    });

    return actualizada;
  }

  // Un equipo devuelto danado se da de baja en el acto, con su motivo: no se
  // reparan (SPEC 2.135; antes iba a mantencion). "baja" es lo mismo (2.126).
  // El motivo se revisa antes de escribir.
  const paraBaja = params.estadoDevolucion === 'baja' || params.estadoDevolucion === 'danado';
  const motivo = paraBaja
    ? await motivoParaBaja(tx, { id: params.motivoBaja?.id ?? '' }, params.motivoBaja?.detalle)
    : null;
  // El motivo queda como comentario de la devolucion, junto a lo que se anoto.
  const observacionesDevolucion = motivo
    ? `Motivo de baja: ${motivo.motivoTexto}${params.observacionesDevolucion ? ` — ${params.observacionesDevolucion}` : ''}`
    : params.observacionesDevolucion;

  // Se cierra con una condicion sobre `activo`: si otra devolucion simultanea
  // ya la cerro, esta no encuentra la fila y se rechaza (mismo patron que las
  // entregas, auditoria 27-sep-2026).
  const { count: cerradas } = await tx.assignment.updateMany({
    where: { id: params.assignmentId, activo: true },
    data: { activo: false },
  });
  if (cerradas !== 1) throw new ConflictError('Esta asignación ya fue devuelta');

  const actualizada = await tx.assignment.update({
    where: { id: params.assignmentId },
    data: {
      activo: false,
      fechaDevolucion: params.fechaDevolucion,
      recibidoPor: params.recibidoPor,
      estadoDevolucion: params.estadoDevolucion,
      observacionesDevolucion,
      motivoBajaId: motivo?.motivoBajaId ?? null,
      ...(aplicaCargadorDevolucion && {
        condicionCargadorDevolucion: params.condicionCargadorDevolucion || null,
        observacionesCargadorDevolucion: params.observacionesCargador || null,
      }),
    },
    include: {
      asset: { include: { categoria: true } },
      employee: true,
    },
  });

  // Devolver en buen estado deja el equipo listo para entregar de nuevo:
  // vuelve directo a "disponible". Danado (o "para dar de baja") va directo
  // a baja con su motivo, sin pasar por Mantenciones (SPEC 2.135).
  const danado = params.estadoDevolucion === 'danado';
  const nuevoEstado = paraBaja ? 'baja' : 'disponible';

  const persona = `${assignment.employee.nombres} ${assignment.employee.apellidoPaterno}`;
  const descripcionDevolucion = motivo
    ? `Devuelto por ${persona} y dado de baja. Motivo: ${motivo.motivoTexto}`
    : `Devuelto por ${persona}. Estado: ${etiquetaEstadoDevolucion(params.estadoDevolucion)}`;
  await cambiarEstado(tx, {
    activo: assignment.asset,
    a: nuevoEstado,
    // estadoDevolucion para asignado -> disponible; motivo para un "no
    // devuelto" que se recupera (SPEC 2.87).
    contexto: { hasActiveAssignment: true, estadoDevolucion: params.estadoDevolucion, motivo: descripcionDevolucion },
    datos: {
      ...(danado && { condicion: 'danado' }),
      ...(params.estadoDevolucion === 'ok' && { condicion: 'usado' }),
      ...(paraBaja && { fechaBaja: params.fechaDevolucion }),
      empleadoActualId: null,
    },
    historial: {
      tipoEvento: paraBaja ? 'baja' : 'devolucion',
      descripcion: descripcionDevolucion,
      datosAnteriores: {
        estado: assignment.asset.estado,
        empleadoActualId: assignment.asset.empleadoActualId,
      },
      datosNuevos: {
        estado: nuevoEstado,
        empleadoActualId: null,
        estadoDevolucion: params.estadoDevolucion,
        ...(motivo && { motivoBaja: motivo.motivoTexto }),
      },
      usuarioSistema: quien,
    },
  });

  // Un equipo de baja no queda con mantenciones pendientes (ej. una preventiva
  // programada), igual que en toda baja.
  if (paraBaja) await cancelarAbiertasPorBaja(tx, assignment.assetId);

  // Se devuelve la asignacion ya actualizada, no la que se leyo al entrar:
  // esa todavia dice activo: true y sin fecha de devolucion.
  return actualizada;
}

/**
 * Asignacion historica que trae un Excel importado: el equipo ya estaba en
 * manos de esa persona (la fecha de entrega puede no conocerse).
 */
export function registrarAsignacionImportada(tx: PrismaTx, datos: Prisma.AssignmentUncheckedCreateInput) {
  return tx.assignment.create({ data: datos });
}
