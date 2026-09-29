import { Prisma, Employee } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errores';
import { sedeIdParaCrear } from '@/shared/sedes/filtro';
import { exigirSedeActiva } from '@/shared/sedes/consultas';
import { getInitialState } from '@/modules/solicitudes/maquinaEstados';
import { executeAssignment, executeReturn } from '@/modules/asignaciones/servidor';
import { executeKitReturn } from '@/modules/kit-epp/servidor';
import { executeKitDelivery } from '@/modules/solicitudes/ejecucion';
import {
  actualizarPersonaEnTx,
  crearPersonaEnTx,
  desvincularPersona,
} from '@/modules/personas/servidor';
import { generarNumeroSolicitud } from '@/modules/solicitudes/numero';
import type { CreateWorkflowRequestInput } from '@/modules/solicitudes/validaciones';

/** Intentos de crear el ticket si el numero choca con otra creacion simultanea. */
const INTENTOS_NUMERO = 3;

function esChoqueDeNumero(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta?.target ?? '').includes('numero')
  );
}

/**
 * Crea una solicitud (onboarding, cambio de equipo o desvinculacion) y
 * ejecuta de una lo que trae: asignar equipos, recibir devoluciones,
 * entregar Kit/EPP. El ticket nace cerrado (SPEC 2.82) y todo va en una
 * transaccion: si algo falla, no queda nada a medias.
 */
export async function crearSolicitud(
  data: CreateWorkflowRequestInput,
  sedeIdPedido: string | undefined,
  systemUser: { id: string; nombre: string }
) {
  // El ticket se crea y se cierra en el mismo formulario (SPEC 2.82): sin
  // los datos completos no se crea, en vez de quedar en una etapa intermedia.
  if (data.tipo === 'onboarding') {
    const errorOnboarding = await validarOnboardingCompleto(data);
    if (errorOnboarding) throw new ValidationError(errorOnboarding);
  }

  // El empleado de un onboarding puede venir por id (ya existe, p.ej. se
  // recontrata) o entero en "nuevoEmpleado" (caso normal: recien entra).
  // La verificacion/creacion real se hace DENTRO de la transaccion de mas
  // abajo -- asi, si algo despues falla (un activo ya no esta disponible,
  // etc.), no queda un empleado huerfano sin ticket.
  // Se guarda para poder reactivar mas abajo (dentro de la transaccion) si
  // es un onboarding sobre alguien desvinculado que se reincorpora.
  let empleadoExistente: Employee | null = null;
  // Recuperacion (SPEC 2.87): desvinculacion de alguien ya desvinculado que
  // tiene equipos "No devuelto"; sirve para registrar los que entrega.
  let esRecuperacion = false;
  if (data.tipo !== 'onboarding' || data.employeeId) {
    empleadoExistente = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });
    if (!empleadoExistente) {
      throw new NotFoundError('Empleado no encontrado');
    }
    // No se puede iniciar cambio_equipo/offboarding a nombre de alguien ya
    // desvinculado. Onboarding es la excepcion a proposito: es la via para
    // reincorporar a alguien que ya trabajo antes y volvio -- lo reactiva
    // (estado -> activo) en vez de bloquearlo, ver dentro de la
    // transaccion mas abajo.
    if (empleadoExistente.estado === 'desvinculado' && data.tipo !== 'onboarding') {
      const pendientes =
        data.tipo === 'offboarding'
          ? await prisma.assignment.count({
              where: {
                employeeId: empleadoExistente.id,
                activo: true,
                estadoDevolucion: 'no_devuelto',
              },
            })
          : 0;
      if (pendientes === 0) {
        throw new ConflictError(
          `${empleadoExistente.nombres} ${empleadoExistente.apellidoPaterno} ya está desvinculado${
            data.tipo === 'offboarding' ? ' y no tiene equipos pendientes de devolución' : ''
          }. No se puede crear una nueva solicitud para este empleado.`
        );
      }
      esRecuperacion = true;
    }
  }
  const esReincorporacion =
    data.tipo === 'onboarding' && empleadoExistente?.estado === 'desvinculado';

  const estadoInicial = getInitialState(data.tipo);

  // La sede elegida en el formulario, obligatoria (SPEC 2.117).
  const sedeId = sedeIdParaCrear(sedeIdPedido, {
    requerido: true,
  });
  // Un ingreso nuevo no puede nacer en una sede desactivada (auditoria
  // 27-sep-2026, 2.9). Desvincular o cambiar equipo si: la persona ya esta ahi.
  if (data.tipo === 'onboarding' && sedeId) await exigirSedeActiva(sedeId);

  // Campos comunes a los tres tipos. "employee" y "numero" se agregan recien
  // dentro de la transaccion (el id puede ser de un empleado recien creado;
  // el numero se calcula junto con la creacion).
  const camposComunes: Omit<Prisma.WorkflowRequestCreateInput, 'employee' | 'numero'> = {
    tipo: data.tipo,
    estado: estadoInicial,
    solicitante: { connect: { id: systemUser.id } },
    responsableActual: { connect: { id: systemUser.id } },
    observaciones: data.observaciones,
    assignmentIds: [],
    ...(sedeId ? { sede: { connect: { id: sedeId } } } : {}),
  };

  // Type-specific fields
  if (data.tipo === 'onboarding') {
    camposComunes.fechaIngreso = data.fechaIngreso;
    camposComunes.cargoSolicitado = data.cargoSolicitado;
    camposComunes.ubicacionDestino = data.ubicacionDestino;
    camposComunes.categoriasRequeridas = data.categoriasRequeridas;
    camposComunes.kitBienvenidaSolicitado = data.kitBienvenidaSolicitado;
    camposComunes.eppSolicitado = data.eppSolicitado;
    // Coordinacion de entrega: si se completo en el mismo formulario de
    // creacion, se guarda de una.
    if (data.fechaEntregaCoordinada) {
      camposComunes.fechaEntregaCoordinada = new Date(data.fechaEntregaCoordinada);
    }
    camposComunes.medioEntrega = data.medioEntrega;
    camposComunes.lugarEntrega = data.medioEntrega === 'presencial' ? data.lugarEntrega : null;
    camposComunes.otChilexpressEntrega =
      data.medioEntrega === 'chilexpress' ? data.otChilexpressEntrega : null;
    camposComunes.ciudadEntrega = data.medioEntrega === 'chilexpress' ? data.ciudadEntrega : null;
  } else if (data.tipo === 'cambio_equipo') {
    camposComunes.motivoCambio = data.motivoCambio;
    // Coordinacion de cambio: igual patron, guardada desde ya si vino en
    // el formulario de creacion.
    if (data.fechaCambioCoordinada) {
      camposComunes.fechaCambioCoordinada = new Date(data.fechaCambioCoordinada);
    }
    camposComunes.medioCambio = data.medioCambio;
    camposComunes.lugarCambio = data.medioCambio === 'presencial' ? data.lugarCambio : null;
    camposComunes.otCambioChilexpress =
      data.medioCambio === 'chilexpress' ? data.otCambioChilexpress : null;
    camposComunes.ciudadCambio = data.medioCambio === 'chilexpress' ? data.ciudadCambio : null;
  } else if (data.tipo === 'offboarding') {
    if (esRecuperacion) {
      // La fecha es la de la desvinculacion original: el acta la muestra
      // como fecha de termino.
      const original = await prisma.workflowRequest.findFirst({
        where: {
          employeeId: data.employeeId,
          tipo: 'offboarding',
          fechaDesvinculacion: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { fechaDesvinculacion: true },
      });
      camposComunes.fechaDesvinculacion =
        original?.fechaDesvinculacion ?? data.fechaDesvinculacion ?? null;
    } else {
      if (!data.fechaDesvinculacion) throw new ValidationError('Fecha de desvinculación requerida');
      camposComunes.fechaDesvinculacion = data.fechaDesvinculacion;
    }
    camposComunes.medioDevolucion = data.medioDevolucion;
    camposComunes.otChilexpress = data.otChilexpress;
    camposComunes.ciudadDevolucion = data.ciudadDevolucion;
    // Coordinacion de devolucion: fecha/lugar del mismo formulario --
    // medio/OT/ciudad ya se guardaban desde antes.
    if (data.fechaDevolucionCoordinada) {
      camposComunes.fechaDevolucionCoordinada = new Date(data.fechaDevolucionCoordinada);
    }
    camposComunes.lugarDevolucion =
      data.medioDevolucion === 'presencial' ? data.lugarDevolucion : null;
  }

  const crearTicket = () =>
    prisma.$transaction(async (tx) => {
      const numero = await generarNumeroSolicitud(tx);

      // Empleado: si es un onboarding sin employeeId, se crea aca mismo, en
      // la misma transaccion que el ticket -- si algo falla despues (un
      // activo ya no disponible, un articulo sin stock), todo se revierte
      // junto y no queda un empleado sin ticket.
      let empId: string;
      if (data.tipo === 'onboarding' && !data.employeeId && data.nuevoEmpleado) {
        const nuevo = await crearPersonaEnTx(tx, {
          ...data.nuevoEmpleado,
          // La ficha toma la fecha de ingreso de la solicitud (SPEC 2.119).
          fechaIngreso: data.nuevoEmpleado.fechaIngreso ?? data.fechaIngreso,
          estado: data.nuevoEmpleado.estado || 'activo',
          sedeId,
        });
        empId = nuevo.id;
      } else {
        empId = data.employeeId as string; // garantizado por el schema (superRefine / campo requerido)
      }

      // Empleado existente elegido para este onboarding (reincorporacion):
      // se reactiva si estaba desvinculado (fechaTermino ya no aplica) y/o
      // se actualiza el tipo de contrato si vino en la solicitud -- puede
      // haber cambiado desde la vez anterior (ej: volvio a boleta en vez de
      // contrato). Todo dentro de la misma transaccion que crea el ticket.
      if (data.tipo === 'onboarding' && data.employeeId) {
        const cambiosEmpleado: Prisma.EmployeeUpdateInput = {};
        if (esReincorporacion) {
          cambiosEmpleado.estado = 'activo';
          cambiosEmpleado.fechaTermino = null;
          // Vuelve a entrar: su ingreso es el de esta solicitud (SPEC 2.119).
          cambiosEmpleado.fechaIngreso = data.fechaIngreso;
        }
        if (data.tipoContrato) {
          cambiosEmpleado.tipoContrato = data.tipoContrato;
        }
        if (Object.keys(cambiosEmpleado).length > 0) {
          await actualizarPersonaEnTx(tx, empId, cambiosEmpleado);
        }
      }

      // Onboarding: los equipos elegidos se asignan de una (el Activo queda
      // 'asignado' aunque la entrega fisica sea despues) y el ticket nace
      // cerrado. Cada categoria requerida debe tener su equipo.
      let estadoReal = estadoInicial;
      let cierraDeInmediato = false;
      const assignmentIds: string[] = [];
      let categoriasAsignadas: string[] = [];

      if (
        data.tipo === 'onboarding' &&
        data.assetIdsSeleccionados &&
        data.assetIdsSeleccionados.length > 0
      ) {
        const asignados = await tx.asset.findMany({
          where: { id: { in: data.assetIdsSeleccionados } },
          select: { sedeId: true, categoria: { select: { nombre: true } } },
        });
        // Solo equipos de la sede de la solicitud (el formulario ya filtra;
        // esto lo asegura tambien si llega por otra via).
        if (asignados.some((a) => a.sedeId !== sedeId)) {
          throw new ValidationError('Los equipos deben ser de la sede de la solicitud');
        }

        for (const assetId of data.assetIdsSeleccionados) {
          const cargador = data.condicionCargadorPorAsset?.[assetId];
          const assignment = await executeAssignment(tx, {
            sedeId: sedeId,
            assetId,
            employeeId: empId,
            fechaEntrega: new Date(),
            lugarEntrega: null,
            entregadoPor: systemUser.nombre,
            tipoMovimiento: 'ingreso',
            motivo: `Onboarding - ${numero}`,
            condicionCargadorEntrega: cargador?.condicion || null,
            observacionesCargador: cargador?.observaciones || null,
          });
          assignmentIds.push(assignment.id);
        }

        categoriasAsignadas = asignados.map((a) => a.categoria.nombre);
      }

      if (data.tipo === 'onboarding') {
        const sinEquipo = data.categoriasRequeridas.filter((c) => !categoriasAsignadas.includes(c));
        if (sinEquipo.length > 0) {
          throw new ValidationError(`Falta elegir un equipo para: ${sinEquipo.join(', ')}`);
        }
        estadoReal = 'registro_rrhh';
        cierraDeInmediato = true;
      }

      // Offboarding: si el tecnico ya tiene los equipos (y el EPP) en mano
      // al crear el ticket (caso presencial tipico), puede calificar cada
      // uno de una -- se procesan con executeReturn/executeKitReturn y, si
      // cubre todas las asignaciones activas y todo el EPP entregado del
      // empleado, el ticket se salta equipo_recibido y queda cerrado desde
      // ya, con el empleado pasando a desvinculado. Si la calificacion es
      // PARCIAL, el ticket se queda en solicitud_emitida (no en
      // equipo_recibido) para que el paso "Recibir Equipos" del detalle
      // siga ofreciendo, correctamente, solo lo que todavia falta. El Kit de
      // Bienvenida no se devuelve (es consumible).
      const kitReturnIds: string[] = [];
      // Se evalua aunque no venga ninguna devolucion: un empleado sin
      // equipos ni EPP tambien se desvincula y cierra de inmediato.
      if (data.tipo === 'offboarding') {
        // (ver executeReturn) "no_devuelto" deja la asignacion activa a
        // proposito -- no deberia ser posible en un empleado que recien va a
        // desvincularse, pero se filtra igual por consistencia con el resto
        // de los chequeos de "que falta calificar".
        // Lo que hay que calificar: lo que el empleado tiene en uso o, en una
        // recuperacion, lo que quedo "No devuelto".
        const asignacionesActivas = await tx.assignment.findMany({
          where: {
            employeeId: empId,
            activo: true,
            estadoDevolucion: esRecuperacion ? 'no_devuelto' : null,
          },
          select: { id: true },
        });
        const yaNoDevueltas = new Set(
          (
            await tx.assignment.findMany({
              where: { employeeId: empId, activo: true, estadoDevolucion: 'no_devuelto' },
              select: { id: true },
            })
          ).map((a) => a.id)
        );
        const eppPendiente = await tx.kitAssignment.findMany({
          where: { employeeId: empId, estado: 'entregado', item: { categoria: 'epp' } },
          select: { id: true },
        });
        const cubreTodo =
          asignacionesActivas.every((a) =>
            (data.devoluciones || []).some((d) => d.assignmentId === a.id)
          ) &&
          eppPendiente.every((k) =>
            (data.devolucionesEpp || []).some((d) => d.kitAssignmentId === k.id)
          );
        if (!cubreTodo) {
          throw new ValidationError(
            'Debes calificar la devolución de todos los equipos y EPP del empleado. Si no los entregó, márcalos como "No devolvió".'
          );
        }

        if (
          esRecuperacion &&
          !(data.devoluciones || []).some((d) => d.estadoDevolucion !== 'no_devuelto')
        ) {
          throw new ValidationError(
            'Marca al menos un equipo como devuelto (Buen estado o Dañado).'
          );
        }

        for (const dev of data.devoluciones || []) {
          // Un equipo que ya estaba "No devuelto" y sigue sin devolverse no
          // cambia: ni historial nuevo ni fila en el acta.
          if (dev.estadoDevolucion === 'no_devuelto' && yaNoDevueltas.has(dev.assignmentId))
            continue;
          await executeReturn(tx, {
            assignmentId: dev.assignmentId,
            fechaDevolucion: new Date(),
            recibidoPor: systemUser.nombre,
            estadoDevolucion: dev.estadoDevolucion,
            observacionesDevolucion: dev.observaciones || null,
            condicionCargadorDevolucion: dev.condicionCargador || null,
            observacionesCargador: dev.observacionesCargador || null,
            expectedEmployeeId: empId,
          });
          assignmentIds.push(dev.assignmentId);
        }

        // Solo EPP se devuelve por aca -- si mandan el id de un Kit de
        // Bienvenida, se ignora en silencio en vez de tratarlo como EPP
        // (el Kit de Bienvenida no tiene devolucion en este sistema).
        const eppValidos = eppPendiente.map((k) => k.id);
        for (const dev of data.devolucionesEpp || []) {
          if (!eppValidos.includes(dev.kitAssignmentId)) continue;
          await executeKitReturn(tx, {
            kitAssignmentId: dev.kitAssignmentId,
            estadoDevolucion: dev.estadoDevolucion,
            recibidoPor: systemUser.nombre,
            observaciones: dev.observaciones || null,
            expectedEmployeeId: empId,
          });
          kitReturnIds.push(dev.kitAssignmentId);
        }

        estadoReal = 'consolidacion_cierre';
        cierraDeInmediato = true;
      }

      // Cambio de equipo (SPEC 2.84): uno o varios pares equipo viejo ->
      // reemplazo, todos en esta transaccion (si uno falla, no se aplica
      // ninguno). assignmentIds guarda los pares en orden [viejo1, nuevo1,
      // viejo2, nuevo2, ...]: el comprobante los lee asi, y los tickets de un
      // solo par siguen siendo [viejo, nuevo]. El ticket nace cerrado: cambia
      // y cierra la misma persona (soporte), no hay confirmacion de RRHH.
      if (data.tipo === 'cambio_equipo') {
        for (const cambio of data.cambios) {
          // El reemplazo es de la misma categoria que el equipo devuelto y de
          // la sede de la solicitud (SPEC 2.84). El formulario ya lo limita;
          // aca se asegura para cualquier via.
          const [viejo, reemplazo] = await Promise.all([
            tx.assignment.findUnique({
              where: { id: cambio.oldAssignmentId },
              select: {
                asset: { select: { categoriaId: true, categoria: { select: { nombre: true } } } },
              },
            }),
            tx.asset.findUnique({
              where: { id: cambio.newAssetId },
              select: { sedeId: true, categoriaId: true },
            }),
          ]);
          if (viejo && reemplazo) {
            if (reemplazo.categoriaId !== viejo.asset.categoriaId) {
              const nombre = viejo.asset.categoria.nombre;
              throw new ValidationError(
                `El reemplazo de un equipo "${nombre}" debe ser otro "${nombre}"`
              );
            }
            if (reemplazo.sedeId !== sedeId) {
              throw new ValidationError('El reemplazo debe ser de la sede de la solicitud');
            }
          }
          await executeReturn(tx, {
            assignmentId: cambio.oldAssignmentId,
            fechaDevolucion: new Date(),
            recibidoPor: systemUser.nombre,
            estadoDevolucion: cambio.estadoDevolucion,
            observacionesDevolucion: cambio.observacionesDevolucion || null,
            condicionCargadorDevolucion: cambio.condicionCargadorAnterior || null,
            observacionesCargador: cambio.observacionesCargadorAnterior || null,
            expectedEmployeeId: empId,
            contexto: 'cambio',
          });
          const nuevaAsignacion = await executeAssignment(tx, {
            sedeId: sedeId,
            assetId: cambio.newAssetId,
            employeeId: empId,
            fechaEntrega: new Date(),
            lugarEntrega: null,
            entregadoPor: systemUser.nombre,
            tipoMovimiento: 'cambio',
            motivo: `Cambio de equipo - ${numero}`,
            condicionCargadorEntrega: cambio.condicionCargadorNuevo || null,
            observacionesCargador: cambio.observacionesCargadorNuevo || null,
          });
          assignmentIds.push(cambio.oldAssignmentId, nuevaAsignacion.id);
        }

        estadoReal = 'confirmacion_rrhh';
        cierraDeInmediato = true;
      }

      const workflowRequest = await tx.workflowRequest.create({
        data: {
          ...camposComunes,
          numero,
          employee: { connect: { id: empId } },
          estado: estadoReal,
          assignmentIds,
          kitReturnIds,
          ...(cierraDeInmediato && { fechaCierre: new Date() }),
        },
        include: {
          employee: true,
          solicitante: { select: { nombre: true, rol: true } },
          responsableActual: { select: { nombre: true, rol: true } },
        },
      });

      // El paso a "desvinculado" es propio de offboarding -- cambio_equipo
      // tambien puede cerrar de inmediato (ver arriba) pero el empleado
      // sigue activo, solo cambio de equipo.
      if (cierraDeInmediato && data.tipo === 'offboarding') {
        await desvincularPersona(tx, empId);
      }

      // Create initial transition log
      await tx.workflowTransition.create({
        data: {
          requestId: workflowRequest.id,
          estadoAnterior: estadoReal,
          estadoNuevo: estadoReal,
          ejecutadoPorId: systemUser.id,
          comentario: [
            esReincorporacion && 'Reincorporación: empleado reactivado (desvinculado → activo)',
            esRecuperacion && 'Recuperación de equipos de un empleado ya desvinculado',
            'Solicitud creada y cerrada en el mismo formulario',
          ]
            .filter(Boolean)
            .join(' — '),
        },
      });

      // Kit de Bienvenida / EPP elegidos de una al crear el ticket: se
      // entregan igual que si se hiciera despues desde Gestion TI (descuenta
      // stock real y queda registrado contra esta solicitud), pero de
      // inmediato. Es independiente del estado del ticket.
      if (
        data.tipo === 'onboarding' &&
        data.kitItemsSeleccionados &&
        data.kitItemsSeleccionados.length > 0
      ) {
        for (const { itemId, cantidad } of data.kitItemsSeleccionados) {
          await executeKitDelivery(tx, {
            sedeId: sedeId,
            itemId,
            cantidad,
            employeeId: empId,
            requestId: workflowRequest.id,
            entregadoPor: systemUser.nombre,
          });
        }
      }

      // Lista de articulos de Kit/EPP requeridos, articulo por articulo. Lo
      // que ya se entrego arriba (kitItemsSeleccionados) queda marcado
      // "entregado" de una; el resto queda "pendiente" y bloquea el cierre
      // del ticket hasta que se entregue o se marque "no aplica".
      if (
        data.tipo === 'onboarding' &&
        data.kitItemsRequeridos &&
        data.kitItemsRequeridos.length > 0
      ) {
        const yaEntregados = new Set((data.kitItemsSeleccionados || []).map((k) => k.itemId));
        await tx.requestKitItem.createMany({
          data: data.kitItemsRequeridos.map(({ itemId, cantidad }) => ({
            requestId: workflowRequest.id,
            itemId,
            cantidad,
            estado: yaEntregados.has(itemId) ? 'entregado' : 'pendiente',
          })),
        });
      }

      // Create pendientes if provided
      if (data.pendientes && data.pendientes.length > 0) {
        await tx.workflowPendiente.createMany({
          data: data.pendientes.map((p) => ({
            requestId: workflowRequest.id,
            tipo: p.tipo,
            descripcion: p.descripcion || null,
          })),
        });
      }

      return workflowRequest;
    });

  // La transaccion se revierte entera si falla, asi que reintentar es seguro.
  for (let intento = 1; ; intento++) {
    try {
      return await crearTicket();
    } catch (error) {
      if (intento >= INTENTOS_NUMERO || !esChoqueDeNumero(error)) throw error;
    }
  }
}

type DatosOnboarding = Extract<CreateWorkflowRequestInput, { tipo: 'onboarding' }>;

/**
 * Datos que un onboarding necesita para nacer cerrado (SPEC 2.82). Devuelve
 * el motivo si falta algo; la cobertura de categorias se valida en la
 * transaccion, junto con la asignacion de los equipos.
 */
async function validarOnboardingCompleto(data: DatosOnboarding): Promise<string | null> {
  if (data.assetIdsSeleccionados.length > 0) {
    const faltaEntrega =
      !data.fechaEntregaCoordinada ||
      (data.medioEntrega === 'chilexpress'
        ? !data.otChilexpressEntrega || !data.ciudadEntrega
        : !data.lugarEntrega);
    if (faltaEntrega) {
      return 'Faltan los datos de entrega de los equipos: fecha y lugar, o N° de OT y ciudad de destino.';
    }
  }

  // Todo lo requerido de Kit/EPP se entrega al crear: nada puede quedar pendiente.
  const entregados = new Set(data.kitItemsSeleccionados.map((k) => k.itemId));
  if (data.kitItemsRequeridos.some((k) => !entregados.has(k.itemId))) {
    return 'Todo el Kit de Bienvenida y EPP requerido debe entregarse al crear la solicitud.';
  }

  const categorias = new Set(
    (
      await prisma.welcomeKitItem.findMany({
        where: { id: { in: [...entregados] } },
        select: { categoria: true },
      })
    ).map((i) => i.categoria)
  );
  if (data.kitBienvenidaSolicitado && !categorias.has('kit_bienvenida')) {
    return 'Elige al menos un artículo del Kit de Bienvenida o desmarca la opción.';
  }
  if (data.eppSolicitado && !categorias.has('epp')) {
    return 'Elige al menos un artículo de EPP o desmarca la opción.';
  }
  return null;
}
