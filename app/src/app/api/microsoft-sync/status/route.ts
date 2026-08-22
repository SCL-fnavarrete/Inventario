import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { checkConfiguration } from '@/lib/services/microsoftGraphService';
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// GET /api/microsoft-sync/status - Estado de configuracion
export async function GET() {
  try {
    await requirePermission('configuracion', 'read');

    const config = checkConfiguration();

    const [totalMicrosoft, totalManuales] = await Promise.all([
      prisma.employee.count({ where: { origenMicrosoft: true } }),
      prisma.employee.count({ where: { origenMicrosoft: false } }),
    ]);

    return NextResponse.json({
      ...config,
      stats: {
        totalEmpleadosMicrosoft: totalMicrosoft,
        totalEmpleadosManuales: totalManuales,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener estado de configuración');
  }
}
