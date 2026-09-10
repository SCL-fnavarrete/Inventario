import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';
import { entregarKitItemsSchema, marcarKitItemNoAplicaSchema } from '@/lib/validations/kitItem';
import { executeKitDelivery } from '@/lib/services/workflowExecutionService';

// POST /api/solicitudes/[id]/kit-epp
// Entrega articulos de Kit de Bienvenida / EPP para una solicitud de
// onboarding. Deliberadamente separado de /api/solicitudes/[id]/transicion:
// Kit/EPP no participa del avance de estados de la solicitud (que sigue
// dependiendo solo de categoriasRequeridas / Activos), asi que no hay
// riesgo de interferir con esa logica.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;

    const body = await request.json();
    const validated = entregarKitItemsSchema.parse(body);

    const systemUser = await prisma.systemUser.findUnique({
      where: { email: session.user?.email || '' },
    });
    if (!systemUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const solicitud = await prisma.workflowRequest.findUnique({ where: { id } });
    if (!solicitud) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    assertSedeAccess(session, solicitud.sedeId, 'Solicitud no encontrada');

    if (solicitud.tipo !== 'onboarding') {
      return NextResponse.json(
        { error: 'Solo las solicitudes de onboarding entregan Kit de Bienvenida / EPP' },
        { status: 400 }
      );
    }
    if (solicitud.estado === 'registro_rrhh') {
      return NextResponse.json({ error: 'La solicitud ya está cerrada' }, { status: 400 });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const entregas = [];
      for (const { itemId, cantidad } of validated.items) {
        const entrega = await executeKitDelivery(tx, {
          itemId,
          cantidad,
          employeeId: solicitud.employeeId,
          requestId: solicitud.id,
          entregadoPor: systemUser.nombre,
        });
        entregas.push(entrega);
      }
      return entregas;
    });

    return NextResponse.json({ entregas: resultado }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al entregar Kit de Bienvenida / EPP');
  }
}

// PATCH /api/solicitudes/[id]/kit-epp
// Marca un articulo requerido (RequestKitItem) como "No aplica": la salida
// para cerrar el ticket cuando genuinamente no se puede entregar ese
// articulo (sin stock, no corresponde para este puesto, etc.).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;

    const body = await request.json();
    const validated = marcarKitItemNoAplicaSchema.parse(body);

    const systemUser = await prisma.systemUser.findUnique({
      where: { email: session.user?.email || '' },
    });
    if (!systemUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const solicitud = await prisma.workflowRequest.findUnique({ where: { id } });
    if (!solicitud) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    assertSedeAccess(session, solicitud.sedeId, 'Solicitud no encontrada');

    if (solicitud.estado === 'registro_rrhh') {
      return NextResponse.json({ error: 'La solicitud ya está cerrada' }, { status: 400 });
    }

    const requerido = await prisma.requestKitItem.findUnique({
      where: { id: validated.requestKitItemId },
    });
    if (!requerido || requerido.requestId !== id) {
      return NextResponse.json(
        { error: 'Artículo requerido no encontrado para esta solicitud' },
        { status: 404 }
      );
    }
    if (requerido.estado !== 'pendiente') {
      return NextResponse.json(
        { error: 'Ese artículo ya fue resuelto (entregado o marcado como no aplica)' },
        { status: 409 }
      );
    }

    const actualizado = await prisma.requestKitItem.update({
      where: { id: requerido.id },
      data: {
        estado: 'no_aplica',
        motivoNoAplica: validated.motivo,
        resueltoPor: systemUser.nombre,
        resueltoEn: new Date(),
      },
      include: { item: true },
    });

    return NextResponse.json(actualizado);
  } catch (error) {
    return handleApiError(error, 'Error al marcar artículo como no aplica');
  }
}
