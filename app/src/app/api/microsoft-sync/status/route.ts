import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkConfiguration } from '@/lib/services/microsoftGraphService';

// GET /api/microsoft-sync/status - Estado de configuracion
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo administradores pueden ver esta configuración' },
        { status: 403 }
      );
    }

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
    console.error('Error al obtener estado de Microsoft Sync:', error);
    return NextResponse.json(
      { error: 'Error al obtener estado de configuración' },
      { status: 500 }
    );
  }
}
