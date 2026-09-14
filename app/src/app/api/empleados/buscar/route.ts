import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatearRut, limpiarRut, validarDigitoVerificador } from "@/lib/validations/rut";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';

// GET /api/empleados/buscar?rut=21.523.308-1 - Buscar empleado por RUT
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('empleados', 'read');

    const searchParams = request.nextUrl.searchParams;
    const rut = searchParams.get("rut");

    if (!rut) {
      return NextResponse.json(
        { error: "El RUT es requerido" },
        { status: 400 }
      );
    }

    // Validar formato de RUT
    const rutLimpio = limpiarRut(rut);
    if (rutLimpio.length < 8 || !validarDigitoVerificador(rutLimpio)) {
      return NextResponse.json(
        { error: "RUT inválido" },
        { status: 400 }
      );
    }

    // Formatear RUT para buscar
    const rutFormateado = formatearRut(rut);

    // Buscar empleado
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { rut: rutFormateado },
          { rut: rutLimpio },
          { rut: { contains: rutLimpio.slice(0, -1) } }, // Búsqueda parcial sin DV
        ],
      },
      include: {
        assignments: {
          where: { activo: true },
          include: {
            asset: {
              include: {
                categoria: true,
              },
            },
          },
        },
        kitAssignments: {
          where: { estado: "entregado" },
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

    if (!employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado", rut: rutFormateado },
        { status: 404 }
      );
    }

    // Esta busqueda no validaba sede: un tecnico podia consultar la ficha
    // completa (con todos sus equipos) de un empleado de cualquier sede
    // buscandolo por RUT (2.24.1).
    assertSedeAccess(session, employee.sedeId, 'Empleado no encontrado');

    return NextResponse.json(employee);
  } catch (error) {
    return handleApiError(error, 'Error al buscar empleado');
  }
}
