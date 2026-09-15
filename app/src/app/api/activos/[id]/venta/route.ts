import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { assetVentaSchema } from '@/lib/validations/assetTransition';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { requirePermission, handleApiError, ConflictError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';

// SPEC 2.7.4: Proceso de Venta
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('activos', 'write');

    const { id } = await params;
    const body = await request.json();

    // Validar datos de venta
    const validationResult = assetVentaSchema.safeParse(body);
    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // Cargar activo
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        assignments: { where: { activo: true } },
        categoria: true,
      },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Activo no encontrado' }, { status: 404 });
    }

    // Esta ruta no validaba sede: un tecnico que conociera/adivinara el id
    // de un activo de otra sede podia venderlo igual (2.24.1).
    assertSedeAccess(session, asset.sedeId, 'Activo no encontrado');

    // Un registro descartado es basura de importacion: no genera movimientos.
    if (asset.deletedAt) {
      throw new ConflictError('Este activo esta descartado y no admite movimientos');
    }

    // SPEC: Solo se puede vender desde baja
    if (asset.estado !== 'baja') {
      return NextResponse.json(
        { error: `El activo debe estar en estado "baja" para vender. Estado actual: ${asset.estado}` },
        { status: 400 }
      );
    }

    // Verificar sin asignación activa
    if (asset.assignments.length > 0) {
      return NextResponse.json(
        { error: 'El activo tiene una asignación activa. No se puede vender.' },
        { status: 400 }
      );
    }

    // Validar transición
    const transitionResult = validateTransition(asset.estado, 'vendido', {
      hasActiveAssignment: false,
      hasActiveMaintenance: false,
      motivo: `Venta a ${data.comprador}`,
    });

    if (!transitionResult.valid) {
      return NextResponse.json(
        { error: 'Transición no permitida', details: transitionResult.errors },
        { status: 400 }
      );
    }

    const usuario = session.user?.email || 'sistema';

    // Ejecutar venta en transacción
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.asset.update({
        where: { id },
        data: {
          estado: 'vendido',
          // Antes no se guardaba en ninguna parte -- se usaba siempre la
          // fecha de hoy en el historial, ignorando la que se ingresaba
          // aca (SPEC 2.25).
          fechaVenta: data.fechaVenta,
        },
        include: { categoria: true },
      });

      // Registrar en historial (reutiliza assetHistoryService)
      await assetHistoryService.registrarVenta(
        id,
        data.comprador,
        Number(data.monto),
        usuario,
        data.fechaVenta,
        data.moneda,
        tx
      );

      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al registrar la venta');
  }
}
