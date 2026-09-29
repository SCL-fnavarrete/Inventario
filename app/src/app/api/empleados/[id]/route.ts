import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import {
  requirePermission,
  handleApiError,
  respuestaDatosInvalidos,
  errorRepetido,
  errorDeCampo,
  ValidationError,
} from '@/lib/auth/guard';
import {
  MENSAJE_TERMINO_ANTES_DE_INGRESO,
  terminaAntesDeEmpezar,
} from "@/lib/validations/ordenFechas";
import { auditLogService } from '@/lib/services/auditLogService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/empleados/[id] - Obtener empleado por ID o RUT
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('empleados', 'read');
    const { id } = await params;

    // Intentar buscar por UUID primero, luego por RUT
    let employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            asset: {
              include: {
                categoria: true,
              },
            },
          },
          orderBy: { fechaEntrega: "desc" },
        },
        kitAssignments: {
          include: {
            item: true,
          },
        },
        activosActuales: {
          include: {
            categoria: true,
          },
        },
      },
    });

    // Si no se encuentra por UUID, intentar buscar por RUT
    if (!employee) {
      employee = await prisma.employee.findUnique({
        where: { rut: id },
        include: {
          assignments: {
            include: {
              asset: {
                include: {
                  categoria: true,
                },
              },
            },
            orderBy: { fechaEntrega: "desc" },
          },
          kitAssignments: {
            include: {
              item: true,
            },
          },
          activosActuales: {
            include: {
              categoria: true,
            },
          },
        },
      });
    }

    if (!employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(employee);
  } catch (error) {
    return handleApiError(error, 'Error al obtener empleado');
  }
}

// PUT /api/empleados/[id] - Actualizar empleado
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('empleados', 'write');
    const { id } = await params;
    const body = await request.json();

    // Validar datos
    const validationResult = updateEmployeeSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // Verificar que el empleado existe
    const existingEmployee = await prisma.employee.findUnique({
      where: { id },
    });

    if (!existingEmployee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    // Si solo llega una de las dos fechas, se compara con la ya guardada.
    if (
      terminaAntesDeEmpezar(
        data.fechaIngreso !== undefined ? data.fechaIngreso : existingEmployee.fechaIngreso,
        data.fechaTermino !== undefined ? data.fechaTermino : existingEmployee.fechaTermino
      )
    ) {
      throw new ValidationError(MENSAJE_TERMINO_ANTES_DE_INGRESO, [
        { field: "fechaTermino", message: MENSAJE_TERMINO_ANTES_DE_INGRESO },
      ]);
    }

    // Si se está actualizando el RUT, verificar que no exista otro empleado con ese RUT
    if (data.rut && data.rut !== existingEmployee.rut) {
      const existingByRut = await prisma.employee.findUnique({
        where: { rut: data.rut },
      });

      if (existingByRut) {
        throw errorRepetido("rut", "Ya existe otro empleado con este RUT");
      }
    }

    // El correo de empresa es el correo obligatorio y unico del empleado.
    // Se comprueba el duplicado solo si el valor viene y cambio.
    if (data.correoEmpresa && data.correoEmpresa !== existingEmployee.correoEmpresa) {
      const existingByCorreoEmpresa = await prisma.employee.findUnique({
        where: { correoEmpresa: data.correoEmpresa },
      });

      if (existingByCorreoEmpresa) {
        throw errorRepetido("correoEmpresa", "Ya existe otro empleado con este correo de empresa");
      }
    }

    // El correo personal pasa a ser opcional, pero sigue siendo unico cuando
    // el empleado si lo tiene registrado
    if (data.correoPersonal && data.correoPersonal !== existingEmployee.correoPersonal) {
      const existingByEmail = await prisma.employee.findUnique({
        where: { correoPersonal: data.correoPersonal },
      });

      if (existingByEmail) {
        throw errorRepetido("correoPersonal", "Ya existe otro empleado con este correo personal");
      }
    }

    // Desvincular no es una edicion de datos: pasar a "desvinculado"
    // implica devolver los equipos y dejar constancia del motivo, y eso
    // solo ocurre dentro de una Solicitud de desvinculacion. Se rechaza
    // solo el cambio a desvinculado; un empleado que ya lo esta sigue
    // pudiendo editarse.
    if (data.estado === 'desvinculado' && existingEmployee.estado !== 'desvinculado') {
      return NextResponse.json(
        {
          error:
            'Para desvincular a un empleado hay que crear una Solicitud de desvinculación: ahí se registran la devolución de sus equipos y el motivo.',
          redirectTo: '/solicitudes/nueva',
        },
        { status: 400 }
      );
    }

    // Lo inverso tampoco es una edicion (auditoria 27-sep-2026, 2.9): quien
    // vuelve a la empresa entra por una Solicitud de Onboarding de
    // reincorporacion, que registra la fecha, el cargo y sus equipos.
    if (existingEmployee.estado === 'desvinculado' && data.estado && data.estado !== 'desvinculado') {
      return NextResponse.json(
        {
          error:
            'Para reincorporar a un empleado desvinculado hay que crear una Solicitud de Onboarding (reincorporación).',
          redirectTo: '/solicitudes/nueva',
        },
        { status: 400 }
      );
    }

    // Reasignar sede (ej. el empleado se traslada de sede): cualquiera puede
    // (SPEC 2.117), con las reglas de abajo.
    if (data.sedeId && data.sedeId !== existingEmployee.sedeId) {
      const sedeDestino = await prisma.sede.findUnique({ where: { id: data.sedeId } });
      if (!sedeDestino) {
        return NextResponse.json({ error: "Sede no encontrada" }, { status: 404 });
      }
      // Auditoria 27-sep-2026, 2.9: ni a una sede desactivada, ni con
      // equipos en la mano (quedarian en una sede y la persona en otra).
      if (!sedeDestino.activa) {
        throw errorDeCampo("sedeId", "La sede elegida está desactivada");
      }
      const equiposAsignados = await prisma.assignment.count({ where: { employeeId: id, activo: true } });
      if (equiposAsignados > 0) {
        throw errorDeCampo(
          "sedeId",
          `Tiene ${equiposAsignados} equipo${equiposAsignados === 1 ? "" : "s"} asignado${equiposAsignados === 1 ? "" : "s"}: devuélvelos o cámbialos antes de trasladarlo de sede`
        );
      }
    }

    // Actualizar empleado
    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...(data.rut && { rut: data.rut }),
        ...(data.nombres && { nombres: data.nombres }),
        ...(data.apellidoPaterno && { apellidoPaterno: data.apellidoPaterno }),
        ...(data.apellidoMaterno !== undefined && { apellidoMaterno: data.apellidoMaterno }),
        ...(data.correoPersonal && { correoPersonal: data.correoPersonal }),
        ...(data.correoEmpresa !== undefined && { correoEmpresa: data.correoEmpresa }),
        ...(data.cargo !== undefined && { cargo: data.cargo }),
        ...(data.jefatura !== undefined && { jefatura: data.jefatura }),
        ...(data.supervisor !== undefined && { supervisor: data.supervisor }),
        ...(data.ubicacion !== undefined && { ubicacion: data.ubicacion }),
        ...(data.division !== undefined && { division: data.division }),
        ...(data.area !== undefined && { area: data.area }),
        ...(data.subArea !== undefined && { subArea: data.subArea }),
        ...(data.direccionParticular !== undefined && { direccionParticular: data.direccionParticular }),
        ...(data.listasDistribucion !== undefined && { listasDistribucion: data.listasDistribucion }),
        ...(data.tipoContrato && { tipoContrato: data.tipoContrato }),
        ...(data.fechaIngreso !== undefined && { fechaIngreso: data.fechaIngreso }),
        ...(data.fechaTermino !== undefined && { fechaTermino: data.fechaTermino }),
        ...(data.estado && { estado: data.estado }),
        ...(data.telefonoContacto !== undefined && { telefonoContacto: data.telefonoContacto }),
        ...(data.sedeId !== undefined && { sedeId: data.sedeId }),
      },
    });

    // Auditoria generica: que cambio y quien lo hizo. Se guardan solo los
    // campos "de negocio" relevantes, no todo el registro.
    const snapshotEmpleado = (e: typeof existingEmployee) => ({
      nombres: e.nombres,
      apellidoPaterno: e.apellidoPaterno,
      apellidoMaterno: e.apellidoMaterno,
      rut: e.rut,
      correoPersonal: e.correoPersonal,
      correoEmpresa: e.correoEmpresa,
      cargo: e.cargo,
      jefatura: e.jefatura,
      estado: e.estado,
      tipoContrato: e.tipoContrato,
      sedeId: e.sedeId,
    });
    await auditLogService.registrarActualizacion(
      'empleado',
      employee.id,
      `Empleado actualizado: ${employee.nombres} ${employee.apellidoPaterno}`,
      snapshotEmpleado(existingEmployee),
      snapshotEmpleado(employee),
      session.user?.email
    );

    return NextResponse.json(employee);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar empleado');
  }
}

