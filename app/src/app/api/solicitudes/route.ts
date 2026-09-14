import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createWorkflowRequestSchema, workflowFiltersSchema } from '@/lib/validations/workflow';
import { getInitialState } from '@/lib/services/workflowStateMachine';
import { executeAssignment, executeKitDelivery, executeReturn, executeKitReturn } from '@/lib/services/workflowExecutionService';
import { Prisma, Employee } from '@prisma/client';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { sedeWhere, sedeIdParaCrear, assertSedeAccess, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { normalizeRut } from '@/lib/utils/rut';
import { removeAccents, matchNoAccent } from '@/lib/utils/text';

async function generateNumero(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.workflowRequest.count({
    where: {
      numero: { startsWith: `WF-${year}-` },
    },
  });
  return `WF-${year}-${String(count + 1).padStart(4, '0')}`;
}

// GET /api/solicitudes - List with filters
export async function GET(request: NextRequest) {

  try {
    const session = await requirePermission('solicitudes', 'read');
    const searchParams = request.nextUrl.searchParams;
    const filtersResult = workflowFiltersSchema.safeParse({
      search: searchParams.get('search') || undefined,
      tipo: searchParams.get('tipo') || undefined,
      estado: searchParams.get('estado') || undefined,
      responsableActualId: searchParams.get('responsableActualId') || undefined,
      fechaDesde: searchParams.get('fechaDesde') || undefined,
      fechaHasta: searchParams.get('fechaHasta') || undefined,
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 10,
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // Aislamiento por sede (SPEC 2.9): admin ve todo, el resto solo lo suyo.
    const where: Prisma.WorkflowRequestWhereInput = { ...sedeWhere(session) };

    // Selector de sede del nav (Etapa 2): solo quien ya tiene visibilidad
    // total (admin/tecnico) puede acotar por una sede especifica.
    const sedeIdFiltro = searchParams.get("sedeId") || "";
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      where.sedeId = sedeIdFiltro;
    }

    if (filters.tipo) where.tipo = filters.tipo;
    // 'abierto'/'cerrado' en vez del estado interno detallado: un ticket
    // esta cerrado cuando tiene fechaCierre (lo pone la transicion final).
    if (filters.estado === 'abierto') where.fechaCierre = null;
    if (filters.estado === 'cerrado') where.fechaCierre = { not: null };
    if (filters.responsableActualId) where.responsableActualId = filters.responsableActualId;

    if (filters.fechaDesde || filters.fechaHasta) {
      where.createdAt = {};
      if (filters.fechaDesde) where.createdAt.gte = new Date(filters.fechaDesde);
      if (filters.fechaHasta) where.createdAt.lte = new Date(filters.fechaHasta);
    }

    const includeSolicitud = {
      employee: {
        select: {
          id: true,
          rut: true,
          nombres: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          cargo: true,
          correoPersonal: true,
        },
      },
      solicitante: { select: { id: true, nombre: true, rol: true } },
      responsableActual: { select: { id: true, nombre: true, rol: true } },
      _count: { select: { comments: true, pendientes: true } },
    } as const;

    // El termino de busqueda se filtra en memoria en vez de mandarlo a
    // Prisma como `contains` (11-sep-2026, mismo patron ya usado en
    // /api/empleados y /api/asignaciones): `employee.rut` se guarda
    // formateado ("12.345.678-9") y el usuario casi siempre lo escribe sin
    // puntos, asi que un `contains` directo nunca hacia match. `normalizeRut`
    // saca puntos/guion de ambos lados antes de comparar; numero/nombre/
    // apellido/observaciones quedan sin distinguir acentos (`matchNoAccent`).
    const terminoBusqueda = filters.search?.trim() ?? "";

    let data;
    let total;

    if (terminoBusqueda) {
      const normalizedSearch = normalizeRut(terminoBusqueda);
      const searchSinAcentos = removeAccents(terminoBusqueda.toLowerCase());

      const todas = await prisma.workflowRequest.findMany({
        where,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        include: includeSolicitud,
      });

      const filtradas = todas.filter((s) => {
        if (matchNoAccent(s.numero, searchSinAcentos)) return true;
        if (matchNoAccent(s.observaciones, searchSinAcentos)) return true;
        if (matchNoAccent(s.employee.nombres, searchSinAcentos)) return true;
        if (matchNoAccent(s.employee.apellidoPaterno, searchSinAcentos)) return true;

        const rutNormalizado = s.employee.rut ? normalizeRut(s.employee.rut) : "";
        if (normalizedSearch && rutNormalizado.includes(normalizedSearch)) return true;

        return false;
      });

      total = filtradas.length;
      data = filtradas.slice(skip, skip + filters.limit);
    } else {
      [data, total] = await Promise.all([
        prisma.workflowRequest.findMany({
          where,
          skip,
          take: filters.limit,
          orderBy: { [filters.sortBy]: filters.sortOrder },
          include: includeSolicitud,
        }),
        prisma.workflowRequest.count({ where }),
      ]);
    }

    return NextResponse.json({
      data,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener solicitudes');
  }
}

// POST /api/solicitudes - Create new request
export async function POST(request: NextRequest) {

  try {
    const session = await requirePermission('solicitudes', 'write');
    const body = await request.json();
    const validationResult = createWorkflowRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // Find the system user by session email
    const systemUser = await prisma.systemUser.findUnique({
      where: { email: session.user?.email || '' },
    });
    if (!systemUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // El empleado de un onboarding puede venir por id (ya existe, p.ej. se
    // recontrata) o entero en "nuevoEmpleado" (caso normal: recien entra).
    // La verificacion/creacion real se hace DENTRO de la transaccion de mas
    // abajo -- asi, si algo despues falla (un activo ya no esta disponible,
    // etc.), no queda un empleado huerfano sin ticket.
    // Se guarda para poder reactivar mas abajo (dentro de la transaccion) si
    // es un onboarding sobre alguien desvinculado que se reincorpora.
    let empleadoExistente: Employee | null = null;
    if (data.tipo !== 'onboarding' || data.employeeId) {
      empleadoExistente = await prisma.employee.findUnique({
        where: { id: data.employeeId },
      });
      if (!empleadoExistente) {
        return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
      }
      // No se puede iniciar cambio_equipo/offboarding a nombre de alguien ya
      // desvinculado. Onboarding es la excepcion a proposito: es la via para
      // reincorporar a alguien que ya trabajo antes y volvio -- lo reactiva
      // (estado -> activo) en vez de bloquearlo, ver dentro de la
      // transaccion mas abajo.
      if (empleadoExistente.estado === 'desvinculado' && data.tipo !== 'onboarding') {
        return NextResponse.json(
          {
            error: `${empleadoExistente.nombres} ${empleadoExistente.apellidoPaterno} ya está desvinculado. No se puede crear una nueva solicitud para este empleado.`,
          },
          { status: 409 }
        );
      }
      // Defensa en profundidad: aunque el selector de empleados ya viene
      // filtrado por sede, un no-admin no puede crear una solicitud para un
      // empleado de otra sede. Ver SPEC 2.9.
      assertSedeAccess(session, empleadoExistente.sedeId, 'Empleado no encontrado');
    }
    const esReincorporacion =
      data.tipo === 'onboarding' && empleadoExistente?.estado === 'desvinculado';

    const numero = await generateNumero();
    const estadoInicial = getInitialState(data.tipo);

    // La sede se hereda de quien crea la solicitud; admin debe elegirla
    // explicitamente (requerido: true) -- si queda en null el ticket
    // termina visible solo para el admin y ningun tecnico lo ve nunca. Ver
    // nota en sedeIdParaCrear y SPEC 2.9.
    const sedeId = sedeIdParaCrear(session, (body as { sedeId?: string }).sedeId, {
      requerido: true,
    });

    // Campos comunes a los tres tipos. "employee" se agrega recien dentro de
    // la transaccion, una vez resuelto el id (existente o recien creado).
    const camposComunes: Omit<Prisma.WorkflowRequestCreateInput, 'employee'> = {
      numero,
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
    } else if (data.tipo === 'cambio_equipo') {
      camposComunes.motivoCambio = data.motivoCambio;
    } else if (data.tipo === 'offboarding') {
      camposComunes.fechaDesvinculacion = data.fechaDesvinculacion;
      camposComunes.medioDevolucion = data.medioDevolucion;
      camposComunes.otChilexpress = data.otChilexpress;
      camposComunes.ciudadDevolucion = data.ciudadDevolucion;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Empleado: si es un onboarding sin employeeId, se crea aca mismo, en
      // la misma transaccion que el ticket -- si algo falla despues (un
      // activo ya no disponible, un articulo sin stock), todo se revierte
      // junto y no queda un empleado sin ticket.
      let empId: string;
      if (data.tipo === 'onboarding' && !data.employeeId && data.nuevoEmpleado) {
        const nuevo = await tx.employee.create({
          data: {
            ...data.nuevoEmpleado,
            estado: data.nuevoEmpleado.estado || 'activo',
            sedeId,
          },
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
        }
        if (data.tipoContrato) {
          cambiosEmpleado.tipoContrato = data.tipoContrato;
        }
        if (Object.keys(cambiosEmpleado).length > 0) {
          await tx.employee.update({ where: { id: empId }, data: cambiosEmpleado });
        }
      }

      // Si al crear la solicitud de onboarding ya se eligieron equipos
      // especificos (no solo categorias), se asignan de una -- el Activo
      // queda reservado (estado 'asignado') desde este momento, aunque la
      // entrega fisica sea despues. Si alcanza para cubrir todas las
      // categorias requeridas la solicitud arranca directo en "Coordinando
      // Entrega"; si cubre solo parte, arranca en Gestion TI para completar
      // el resto cuando haya stock; si no se eligio nada, arranca igual que
      // antes en Solicitud Recibida.
      let estadoReal = estadoInicial;
      const assignmentIds: string[] = [];

      if (
        data.tipo === 'onboarding' &&
        data.assetIdsSeleccionados &&
        data.assetIdsSeleccionados.length > 0
      ) {
        for (const assetId of data.assetIdsSeleccionados) {
          const assignment = await executeAssignment(tx, {
            assetId,
            employeeId: empId,
            fechaEntrega: new Date(),
            lugarEntrega: null,
            entregadoPor: systemUser.nombre,
            tipoMovimiento: 'ingreso',
            motivo: `Onboarding - ${numero}`,
          });
          assignmentIds.push(assignment.id);
        }

        const asignados = await tx.assignment.findMany({
          where: { id: { in: assignmentIds } },
          include: { asset: { include: { categoria: true } } },
        });
        const categoriasAsignadas = asignados.map((a) => a.asset.categoria.nombre);
        const faltanCategorias = data.categoriasRequeridas.some(
          (c) => !categoriasAsignadas.includes(c)
        );

        if (data.categoriasRequeridas.length > 0 && !faltanCategorias) {
          estadoReal = 'coordinando_entrega';
        } else {
          estadoReal = 'gestion_ti';
        }
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
      let cierraDeInmediato = false;
      const kitReturnIds: string[] = [];
      if (
        data.tipo === 'offboarding' &&
        ((data.devoluciones && data.devoluciones.length > 0) ||
          (data.devolucionesEpp && data.devolucionesEpp.length > 0))
      ) {
        // (ver executeReturn) "no_devuelto" deja la asignacion activa a
        // proposito -- no deberia ser posible en un empleado que recien va a
        // desvincularse, pero se filtra igual por consistencia con el resto
        // de los chequeos de "que falta calificar".
        const asignacionesActivas = await tx.assignment.findMany({
          where: { employeeId: empId, activo: true, estadoDevolucion: null },
          select: { id: true },
        });
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

        for (const dev of data.devoluciones || []) {
          await executeReturn(tx, {
            assignmentId: dev.assignmentId,
            fechaDevolucion: new Date(),
            recibidoPor: systemUser.nombre,
            estadoDevolucion: dev.estadoDevolucion,
            observacionesDevolucion: dev.observaciones || null,
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

        estadoReal = cubreTodo ? 'consolidacion_cierre' : estadoInicial;
        cierraDeInmediato = cubreTodo;
      }

      // Cambio de equipo: si al crear el ticket ya se eligio el equipo viejo
      // a devolver (con el estado en que vuelve) y el equipo nuevo de
      // reemplazo, se ejecuta el cambio de una. A diferencia de la
      // transicion manual (que pasa por "cambio_ejecutado" y despues por
      // "confirmacion_rrhh"), aca el ticket queda cerrado de inmediato: este
      // sistema lo usa solo soporte/admin (no RRHH), asi que no hace falta
      // un segundo paso de confirmacion -- la misma persona que ejecuta el
      // cambio es quien cierra el ticket.
      if (
        data.tipo === 'cambio_equipo' &&
        data.oldAssignmentId &&
        data.newAssetId &&
        data.estadoDevolucionAnterior
      ) {
        await executeReturn(tx, {
          assignmentId: data.oldAssignmentId,
          fechaDevolucion: new Date(),
          recibidoPor: systemUser.nombre,
          estadoDevolucion: data.estadoDevolucionAnterior,
          observacionesDevolucion: data.observacionesDevolucionAnterior || null,
          expectedEmployeeId: empId,
        });
        assignmentIds.push(data.oldAssignmentId);

        const nuevaAsignacion = await executeAssignment(tx, {
          assetId: data.newAssetId,
          employeeId: empId,
          fechaEntrega: new Date(),
          lugarEntrega: null,
          entregadoPor: systemUser.nombre,
          tipoMovimiento: 'cambio',
          motivo: `Cambio de equipo - ${numero}`,
        });
        assignmentIds.push(nuevaAsignacion.id);

        estadoReal = 'confirmacion_rrhh';
        cierraDeInmediato = true;
      }

      const workflowRequest = await tx.workflowRequest.create({
        data: {
          ...camposComunes,
          employee: { connect: { id: empId } },
          estado: estadoReal,
          assignmentIds,
          kitReturnIds,
          ...(cierraDeInmediato && { fechaCierre: new Date() }),
        },
        include: {
          employee: true,
          solicitante: { select: { id: true, nombre: true, rol: true } },
          responsableActual: { select: { id: true, nombre: true, rol: true } },
        },
      });

      // El paso a "desvinculado" es propio de offboarding -- cambio_equipo
      // tambien puede cerrar de inmediato (ver arriba) pero el empleado
      // sigue activo, solo cambio de equipo.
      if (cierraDeInmediato && data.tipo === 'offboarding') {
        await tx.employee.update({
          where: { id: empId },
          data: { estado: 'desvinculado' },
        });
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
            estadoReal !== estadoInicial
              ? data.tipo === 'cambio_equipo'
                ? 'Solicitud creada con el cambio de equipo ya ejecutado y ticket cerrado de inmediato'
                : 'Solicitud creada con equipos ya asignados'
              : data.tipo === 'offboarding' && assignmentIds.length + kitReturnIds.length > 0
                ? cierraDeInmediato
                  ? 'Solicitud creada con equipos recibidos y ticket cerrado de inmediato'
                  : 'Solicitud creada con una parte de los equipos ya recibida'
                : 'Solicitud creada',
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

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear solicitud');
  }
}
