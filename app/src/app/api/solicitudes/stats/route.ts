import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/solicitudes/stats - Dashboard stats
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
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
    console.error('Error fetching workflow stats:', error);
    return NextResponse.json({ error: 'Error al obtener estadísticas' }, { status: 500 });
  }
}
