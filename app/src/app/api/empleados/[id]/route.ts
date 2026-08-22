import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

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

    return NextResponse.json(employee);
  } catch (error) {
    return handleApiError(error, 'Error al obtener empleado');
  }
}

// PUT /api/empleados/[id] - Actualizar empleado
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('empleados', 'write');
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

    // Si se está actualizando el correo, verificar que no exista otro empleado con ese correo
    if (data.correo && data.correo !== existingEmployee.correo) {
      const existingByEmail = await prisma.employee.findUnique({
        where: { correo: data.correo },
      });

      if (existingByEmail) {
        return NextResponse.json(
          { error: "Ya existe otro empleado con este correo" },
          { status: 409 }
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
        ...(data.correo && { correo: data.correo }),
        ...(data.cargo !== undefined && { cargo: data.cargo }),
        ...(data.jefatura !== undefined && { jefatura: data.jefatura }),
        ...(data.supervisor !== undefined && { supervisor: data.supervisor }),
        ...(data.ubicacion !== undefined && { ubicacion: data.ubicacion }),
        ...(data.tipoContrato && { tipoContrato: data.tipoContrato }),
        ...(data.fechaIngreso !== undefined && { fechaIngreso: data.fechaIngreso }),
        ...(data.fechaTermino !== undefined && { fechaTermino: data.fechaTermino }),
        ...(data.estado && { estado: data.estado }),
        ...(data.telefonoContacto !== undefined && { telefonoContacto: data.telefonoContacto }),
        ...(data.fechaEntregaKit !== undefined && { fechaEntregaKit: data.fechaEntregaKit }),
        ...(data.fechaEntregaEpp !== undefined && { fechaEntregaEpp: data.fechaEntregaEpp }),
        ...(data.proximaMantencionEpp !== undefined && { proximaMantencionEpp: data.proximaMantencionEpp }),
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
    await requirePermission('empleados', 'delete');
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
