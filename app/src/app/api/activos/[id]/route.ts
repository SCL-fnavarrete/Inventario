import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/prisma';
import { updateAssetSchema } from '@/modules/activos';
import { editarActivo, eliminarActivo } from '@/modules/activos/servidor';
import { requirePermission, handleApiError } from '@/shared/auth/guard';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('activos', 'read');

    const { id } = await params;

    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        categoria: true,
        empleadoActual: {
          select: { nombres: true, apellidoPaterno: true, rut: true },
        },
        assignments: {
          where: { activo: true },
          select: {
            id: true,
            activo: true,
            employee: {
              select: { id: true, nombres: true, apellidoPaterno: true, rut: true },
            },
          },
        },
        // Mantenciones abiertas: la pagina de baja (SPEC 2.88) cierra una
        // de ellas (mantencionACerrar) en vez de crear otra.
        maintenances: {
          where: { estado: { in: ['pendiente', 'en_proceso'] } },
          select: { id: true, estado: true, descripcion: true, tipo: { select: { nombre: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 });
    }

    return NextResponse.json(asset);
  } catch (error) {
    return handleApiError(error, 'Error al obtener activo');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('activos', 'write');
    const { id } = await params;
    const datos = updateAssetSchema.parse(await request.json());
    const asset = await editarActivo(id, datos, session.user?.email || 'sistema');
    return NextResponse.json(asset);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar activo');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('activos', 'delete');
    const { id } = await params;
    const resultado = await eliminarActivo(
      id,
      {
        descartar: request.nextUrl.searchParams.get('descartar') === 'true',
        motivo: request.nextUrl.searchParams.get('motivo')?.trim(),
      },
      session.user?.email || 'sistema'
    );
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar activo');
  }
}
