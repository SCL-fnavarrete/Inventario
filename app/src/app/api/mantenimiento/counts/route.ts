import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

export async function GET() {
  try {
    await requirePermission('configuracion', 'read');

    // Solo admin puede acceder
    // Obtener conteos de todas las tablas
    const [
      activos,
      empleados,
      asignaciones,
      mantenciones,
      historial,
      compras,
    ] = await Promise.all([
      prisma.asset.count(),
      prisma.employee.count(),
      prisma.assignment.count(),
      prisma.maintenance.count(),
      prisma.assetHistory.count(),
      prisma.purchase.count(),
    ]);

    return NextResponse.json({
      activos,
      empleados,
      asignaciones,
      mantenciones,
      historial,
      compras,
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener conteos');
  }
}
