import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { assetBajaSchema } from '@/lib/validations/assetTransition';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { assetHistoryService } from '@/lib/services/assetHistoryService';

// SPEC 2.7.3: Proceso de Baja
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Validar datos de baja
    const validationResult = assetBajaSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Cargar activo con asignaciones y mantenciones activas
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        assignments: { where: { activo: true } },
        maintenances: { where: { estado: { in: ['pendiente', 'en_proceso'] } } },
        categoria: true,
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 });
    }

    // SPEC: Si tiene asignación activa, bloquear
    if (asset.assignments.length > 0) {
      return NextResponse.json(
        {
          error: 'El activo tiene una asignación activa. Debe registrar la devolución primero.',
          redirectTo: `/asignaciones/devolucion?id=${asset.assignments[0].id}`,
        },
        { status: 400 }
      );
    }

    // SPEC: Si está en mantención, bloquear
    if (asset.maintenances.length > 0) {
      return NextResponse.json(
        { error: 'El activo está en mantención activa. Debe completar la mantención primero.' },
        { status: 400 }
      );
    }

    // Validar transición con la máquina de estados
    const transitionResult = validateTransition(asset.estado, 'baja', {
      hasActiveAssignment: false,
      hasActiveMaintenance: false,
      motivo: data.motivo,
    });

    if (!transitionResult.valid) {
      return NextResponse.json(
        { error: 'Transición no permitida', details: transitionResult.errors },
        { status: 400 }
      );
    }

    const usuario = session.user?.email || 'sistema';
    const motivoCompleto = data.motivo === 'otro' ? `${data.motivo}: ${data.motivoDetalle}` : data.motivo;

    // Ejecutar baja en transacción
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id },
        data: {
          estado: 'baja',
          condicion: data.condicionFinal,
          fechaBaja: new Date(),
        },
        include: { categoria: true },
      });

      // Registrar en historial (reutiliza assetHistoryService)
      await assetHistoryService.registrarBaja(id, motivoCompleto, data.condicionFinal, usuario);

      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error processing asset baja:', error);
    return NextResponse.json({ error: 'Error al dar de baja el activo' }, { status: 500 });
  }
}
