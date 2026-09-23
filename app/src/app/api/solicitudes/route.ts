import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createWorkflowRequestSchema, workflowFiltersSchema } from '@/lib/validations/workflow';
import { getInitialState } from '@/lib/services/workflowStateMachine';
import { executeAssignment, executeKitDelivery, executeReturn, executeKitReturn } from '@/lib/services/workflowExecutionService';
import { Prisma, Employee } from '@prisma/client';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { sedeWhere, sedeIdParaCrear, assertSedeAccess, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { normalizeRut } from '@/lib/utils/rut';
import { ValidationError } from '@/lib/errors';
import { removeAccents, matchNoAccent } from '@/lib/utils/text';

/**
 * Siguiente numero del año (WF-2026-0001...), leido dentro de la misma
 * transaccion que crea el ticket. Antes era "cuantos hay + 1" fuera de la
 * transaccion: dos creaciones simultaneas obtenian el mismo numero y una
 * fallaba. Si aun asi chocan, POST reintenta (ver INTENTOS_NUMERO).
 */
async function generateNumero(tx: Prisma.TransactionClient): Promise<string> {
  const prefijo = `WF-${new Date().getFullYear()}-`;
  const ultimos = await tx.workflowRequest.findMany({
    where: { numero: { startsWith: prefijo } },
    select: { numero: true },
  });
  const mayor = ultimos.reduce((max, { numero }) => {
    const n = Number.parseInt(numero.slice(prefijo.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefijo}${String(mayor + 1).padStart(4, '0')}`;
}

/** Intentos de crear el ticket si el numero choca con otra creacion simultanea. */
const INTENTOS_NUMERO = 3;

function esChoqueDeNumero(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    JSON.stringify(error.meta?.target ?? '').includes('numero')
  );
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

    // Aislamiento por sede: admin ve todo, el resto solo lo suyo.
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
          // El correo de empresa es el identificador visible del empleado;
          // el personal puede venir vacio
          correoEmpresa: true,
          correoPersonal: true,
        },
      },
      solicitante: { select: { id: true, nombre: true, rol: true } },
      responsableActual: { select: { id: true, nombre: true, rol: true } },
      _count: { select: { comments: true, pendientes: true } },
    } as const;

    // El termino de busqueda se filtra en memoria en vez de mandarlo a
    // Prisma como `contains`: `employee.rut` se guarda formateado
    // ("12.345.678-9") y el usuario casi siempre lo escribe sin puntos, asi
    // que un `contains` directo nunca hacia match. `normalizeRut` saca
    // puntos/guion de ambos lados antes de comparar; numero/nombre/
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

    // El ticket se crea y se cierra en el mismo formulario (SPEC 2.82): sin
    // los datos completos no se crea, en vez de quedar en una etapa intermedia.
    if (data.tipo === 'onboarding') {
      const errorOnboarding = await validarOnboardingCompleto(data);
      if (errorOnboarding) throw new ValidationError(errorOnboarding);
    }

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
      // empleado de otra sede.
      assertSedeAccess(session, empleadoExistente.sedeId, 'Empleado no encontrado');
    }
    const esReincorporacion =
      data.tipo === 'onboarding' && empleadoExistente?.estado === 'desvinculado';

    const estadoInicial = getInitialState(data.tipo);

    // La sede se hereda de quien crea la solicitud; admin debe elegirla
    // La sede se hereda de quien crea la solicitud; admin debe elegirla
    // explicitamente, o el ticket queda visible solo para el admin.
    const sedeId = sedeIdParaCrear(session, (body as { sedeId?: string }).sedeId, {
      requerido: true,
    });

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
      camposComunes.fechaDesvinculacion = data.fechaDesvinculacion;
      camposComunes.medioDevolucion = data.medioDevolucion;
      camposComunes.otChilexpress = data.otChilexpress;
      camposComunes.ciudadDevolucion = data.ciudadDevolucion;
      // Coordinacion de devolucion: fecha/lugar del mismo formulario --
      // medio/OT/ciudad ya se guardaban desde antes.
      if (data.fechaDevolucionCoordinada) {
        camposComunes.fechaDevolucionCoordinada = new Date(data.fechaDevolucionCoordinada);
      }
      camposComunes.lugarDevolucion = data.medioDevolucion === 'presencial' ? data.lugarDevolucion : null;
    }

    const crearTicket = () => prisma.$transaction(async (tx) => {
      const numero = await generateNumero(tx);

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
        if (!cubreTodo) {
          throw new ValidationError(
            'Debes calificar la devolución de todos los equipos y EPP del empleado. Si no los entregó, márcalos como "No devolvió".'
          );
        }

        for (const dev of data.devoluciones || []) {
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
              select: { asset: { select: { categoriaId: true, categoria: { select: { nombre: true } } } } },
            }),
            tx.asset.findUnique({
              where: { id: cambio.newAssetId },
              select: { sedeId: true, categoriaId: true },
            }),
          ]);
          if (viejo && reemplazo) {
            if (reemplazo.categoriaId !== viejo.asset.categoriaId) {
              const nombre = viejo.asset.categoria.nombre;
              throw new ValidationError(`El reemplazo de un equipo "${nombre}" debe ser otro "${nombre}"`);
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
        const result = await crearTicket();
        return NextResponse.json(result, { status: 201 });
      } catch (error) {
        if (intento >= INTENTOS_NUMERO || !esChoqueDeNumero(error)) throw error;
      }
    }
  } catch (error) {
    return handleApiError(error, 'Error al crear solicitud');
  }
}

type DatosOnboarding = Extract<
  ReturnType<typeof createWorkflowRequestSchema.parse>,
  { tipo: 'onboarding' }
>;

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
