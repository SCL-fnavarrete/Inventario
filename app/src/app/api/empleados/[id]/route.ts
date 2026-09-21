import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { assertSedeAccess, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { auditLogService } from '@/lib/services/auditLogService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/empleados/[id] - Obtener empleado por ID o RUT
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('empleados', 'read');
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

    assertSedeAccess(session, employee.sedeId, 'Empleado no encontrado');

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

    assertSedeAccess(session, existingEmployee.sedeId, 'Empleado no encontrado');

    // Si se está actualizando el RUT, verificar que no exista otro empleado con ese RUT
    if (data.rut && data.rut !== existingEmployee.rut) {
      const existingByRut = await prisma.employee.findUnique({
        where: { rut: data.rut },
      });

      if (existingByRut) {
        return NextResponse.json(
          { error: "Ya existe otro empleado con este RUT" },
          { status: 409 }
        );
      }
    }

    // El correo de empresa es el correo obligatorio y unico del empleado.
    // Se comprueba el duplicado solo si el valor viene y cambio.
    if (data.correoEmpresa && data.correoEmpresa !== existingEmployee.correoEmpresa) {
      const existingByCorreoEmpresa = await prisma.employee.findUnique({
        where: { correoEmpresa: data.correoEmpresa },
      });

      if (existingByCorreoEmpresa) {
        return NextResponse.json(
          { error: "Ya existe otro empleado con este correo de empresa" },
          { status: 409 }
        );
      }
    }

    // El correo personal pasa a ser opcional, pero sigue siendo unico cuando
    // el empleado si lo tiene registrado
    if (data.correoPersonal && data.correoPersonal !== existingEmployee.correoPersonal) {
      const existingByEmail = await prisma.employee.findUnique({
        where: { correoPersonal: data.correoPersonal },
      });

      if (existingByEmail) {
        return NextResponse.json(
          { error: "Ya existe otro empleado con este correo personal" },
          { status: 409 }
        );
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

    // Reasignar sede (ej. el empleado se traslada de sede): solo admin
    // puede hacerlo. Si un tecnico envia sedeId, se ignora en silencio en
    // vez de rechazar toda la actualizacion.
    const puedeCambiarSede = tieneVisibilidadTotal(session);
    if (puedeCambiarSede && data.sedeId) {
      const sedeDestino = await prisma.sede.findUnique({ where: { id: data.sedeId } });
      if (!sedeDestino) {
        return NextResponse.json({ error: "Sede no encontrada" }, { status: 404 });
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
        ...(puedeCambiarSede && data.sedeId !== undefined && { sedeId: data.sedeId }),
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

// DELETE /api/empleados/[id] - Eliminar empleado (soft delete cambiando estado)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  // Esta ruta hacia un "soft delete" que marcaba al empleado como
  // desvinculado. Una desvinculacion no es una edicion de datos ni un
  // borrado: ocurre dentro de una Solicitud de desvinculacion, que es
  // donde queda la devolucion de los equipos y el motivo.
  //
  // Queda como stub en vez de borrarse: responder 410 explicito deja claro
  // que se retiro a proposito, en vez de un 404 que parece un error de
  // ruteo.
  void request;
  void params;
  return NextResponse.json(
    {
      error:
        'Desvincular a un empleado se hace creando una Solicitud de desvinculación, no desde la ficha del empleado.',
      redirectTo: '/solicitudes/nueva',
    },
    { status: 410 }
  );
}
