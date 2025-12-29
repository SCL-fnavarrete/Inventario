import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatearRut, limpiarRut, validarDigitoVerificador } from "@/lib/validations/rut";

// GET /api/empleados/buscar?rut=21.523.308-1 - Buscar empleado por RUT
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

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

    return NextResponse.json(employee);
  } catch (error) {
    console.error("Error searching employee by RUT:", error);
    return NextResponse.json(
      { error: "Error al buscar empleado" },
      { status: 500 }
    );
  }
}
