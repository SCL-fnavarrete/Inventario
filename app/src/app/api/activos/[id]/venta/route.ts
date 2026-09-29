import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/prisma';
import { assetVentaSchema } from '@/modules/activos/validacionesTransicion';
import { validateTransition } from '@/modules/activos/maquinaEstados';
import { assetHistoryService } from '@/modules/activos/historial';
import { requirePermission, handleApiError, ConflictError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { etiquetaEstadoActivo } from '@/modules/activos/estados';
import { cambiarEstado } from '@/modules/activos/servicio';

// Proceso de venta de un activo.
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

    // Un registro descartado es basura de importacion: no genera movimientos.
    if (asset.deletedAt) {
      throw new ConflictError('Este activo esta descartado y no admite movimientos');
    }

    // Solo se puede vender desde el estado baja
    if (asset.estado !== 'baja') {
      return NextResponse.json(
        { error: `El activo debe estar en estado "baja" para vender. Estado actual: ${etiquetaEstadoActivo(asset.estado)}` },
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
      // Solo si sigue de baja y sin empleado: dos ventas a la vez no se
      // registran dos veces (auditoria 28-sep-2026, 7.A-1).
      await cambiarEstado(tx, {
        activo: { id, estado: 'baja' },
        a: 'vendido',
        contexto: { motivo: `Venta a ${data.comprador}` },
        // Persistir la fecha de venta ingresada por el usuario.
        datos: { fechaVenta: data.fechaVenta },
        exigir: { empleadoActualId: null },
      });
      const updated = await tx.asset.findUniqueOrThrow({ where: { id }, include: { categoria: true } });

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
