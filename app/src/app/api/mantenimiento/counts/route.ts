import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Solo admin puede acceder
    const userRole = (session.user as { role?: string; rol?: string }).role ||
                     (session.user as { role?: string; rol?: string }).rol;
    if (userRole !== "admin") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    // Obtener conteos de todas las tablas
    const [
      activos,
      empleados,
      asignaciones,
      mantenciones,
      historial,
      compras,
      desvinculaciones,
    ] = await Promise.all([
      prisma.asset.count(),
      prisma.employee.count(),
      prisma.assignment.count(),
      prisma.maintenance.count(),
      prisma.assetHistory.count(),
      prisma.purchase.count(),
      prisma.termination.count(),
    ]);

    return NextResponse.json({
      activos,
      empleados,
      asignaciones,
      mantenciones,
      historial,
      compras,
      desvinculaciones,
    });
  } catch (error) {
    console.error("Error fetching counts:", error);
    return NextResponse.json(
      { error: "Error al obtener conteos" },
      { status: 500 }
    );
  }
}
