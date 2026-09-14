import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere } from '@/lib/auth/sedeScope';

// GET /api/solicitudes/stats - Dashboard stats
export async function GET() {

  try {
    const session = await requirePermission('solicitudes', 'read');

    // Ninguna de estas 4 consultas filtraba por sede: un tecnico veia
    // estadisticas de toda la empresa aunque el listado normal de
    // Solicitudes si estaba acotado a la suya (2.24.1).
    const sw = sedeWhere(session);
    const [byType, byStatus, total, abiertas] = await Promise.all([
      prisma.workflowRequest.groupBy({
        by: ['tipo'],
        where: sw,
        _count: { id: true },
      }),
      prisma.workflowRequest.groupBy({
        by: ['estado'],
        where: sw,
        _count: { id: true },
      }),
      prisma.workflowRequest.count({ where: sw }),
      prisma.workflowRequest.count({
        where: { ...sw, fechaCierre: null },
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
