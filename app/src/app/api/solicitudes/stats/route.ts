import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// GET /api/solicitudes/stats - Dashboard stats
export async function GET() {

  try {
    await requirePermission('solicitudes', 'read');
    const [byType, byStatus, total, abiertas] = await Promise.all([
      prisma.workflowRequest.groupBy({
        by: ['tipo'],
        _count: { id: true },
      }),
      prisma.workflowRequest.groupBy({
        by: ['estado'],
        _count: { id: true },
      }),
      prisma.workflowRequest.count(),
      prisma.workflowRequest.count({
        where: { fechaCierre: null },
      }),
    ]);

    return NextResponse.json({
      total,
      abiertas,
      cerradas: total - abiertas,
      porTipo: byType.map((t) => ({ tipo: t.tipo, count: t._count.id })),
      porEstado: byStatus.map((s) => ({ estado: s.estado, count: s._count.id })),
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener estadísticas');
  }
}
