import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assetBajaSchema } from '@/lib/validations/assetTransition';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { requirePermission, handleApiError, ConflictError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';

// SPEC 2.7.3: Proceso de Baja
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('activos', 'write');

    const { id } = await params;
    const body = await request.json();

    // Validar datos de baja
    const validationResult = assetBajaSchema.safeParse(body);
    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
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

    // Esta ruta no validaba sede: un tecnico que conociera/adivinara el id
    // de un activo de otra sede podia darlo de baja igual (2.24.1).
    assertSedeAccess(session, asset.sedeId, 'Activo no encontrado');

    // Un registro descartado es basura de importacion: no genera movimientos.
    if (asset.deletedAt) {
      throw new ConflictError('Este activo esta descartado y no admite movimientos');
    }

    // SPEC: Si tiene asignación activa, bloquear
    // 15-sep-2026 (SPEC 2.41): ya no existe una devolucion suelta -- la
    // devolucion solo pasa dentro de una Solicitud (cambio de equipo o
    // desvinculacion). `redirectTo` ahora manda ahi en vez de a una pantalla
    // de devolucion directa que ya no existe.
    if (asset.assignments.length > 0) {
      return NextResponse.json(
        {
          error: 'El activo tiene una asignación activa. Debe devolverse dentro de una Solicitud (cambio de equipo o desvinculación) primero.',
          redirectTo: '/solicitudes/nueva',
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
      await assetHistoryService.registrarBaja(
        id,
        motivoCompleto,
        data.condicionFinal,
        usuario,
        tx
      );

      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al dar de baja el activo');
  }
}
