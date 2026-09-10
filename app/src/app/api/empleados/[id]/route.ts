import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { assertSedeAccess, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';

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
        terminations: {
          orderBy: { fechaDesvinculacion: "desc" },
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
          terminations: {
            orderBy: { fechaDesvinculacion: "desc" },
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
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
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

    // Si se está actualizando el correo personal, verificar que no exista otro empleado con ese correo
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

    // Si se está actualizando el correo de empresa, verificar que no exista otro empleado con ese correo
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

    // Reasignar sede (ej. el empleado se traslada de sede): decision de
    // Javier (10-sep-2026) -- solo admin puede hacerlo, a diferencia de
    // Activos, donde el traslado entre sedes se maneja via Guias de
    // Despacho (sedeOrigenId/sedeDestinoId) y no editando el registro
    // directamente. Si un tecnico envia sedeId igual, se ignora en
    // silencio en vez de rechazar toda la actualizacion -- el resto de
    // los campos del formulario si son suyos para editar.
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
        ...(data.fechaEntregaKit !== undefined && { fechaEntregaKit: data.fechaEntregaKit }),
        ...(data.fechaEntregaEpp !== undefined && { fechaEntregaEpp: data.fechaEntregaEpp }),
        ...(data.proximaMantencionEpp !== undefined && { proximaMantencionEpp: data.proximaMantencionEpp }),
        ...(puedeCambiarSede && data.sedeId !== undefined && { sedeId: data.sedeId }),
      },
    });

    return NextResponse.json(employee);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar empleado');
  }
}

// DELETE /api/empleados/[id] - Eliminar empleado (soft delete cambiando estado)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('empleados', 'delete');
    const { id } = await params;

    // Verificar que el empleado existe
    const existingEmployee = await prisma.employee.findUnique({
      where: { id },
      include: {
        assignments: {
          where: { activo: true },
        },
      },
    });

    if (!existingEmployee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    assertSedeAccess(session, existingEmployee.sedeId, 'Empleado no encontrado');

    // Verificar si tiene equipos asignados activos
    if (existingEmployee.assignments.length > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar un empleado con equipos asignados. Primero debe devolver todos los equipos." },
        { status: 400 }
      );
    }

    // Soft delete - cambiar estado a desvinculado
    const employee = await prisma.employee.update({
      where: { id },
      data: {
        estado: "desvinculado",
      },
    });

    return NextResponse.json({
      message: "Empleado marcado como desvinculado",
      employee,
    });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar empleado');
  }
}
