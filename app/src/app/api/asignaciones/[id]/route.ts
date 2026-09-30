import { NextRequest, NextResponse } from "next/server";
import { returnAssignmentSchema } from "@/modules/asignaciones";
import { cancelarAsignacion, detalleAsignacion, registrarDevolucion } from "@/modules/asignaciones/servidor";
import { requirePermission, handleApiError, respuestaDatosInvalidos, quienHace } from '@/shared/auth/guard';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/asignaciones/[id] - Detalle de una asignación
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('asignaciones', 'read');
    const { id } = await params;
    return NextResponse.json(await detalleAsignacion(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener asignación');
  }
}

// PUT /api/asignaciones/[id] - Registrar devolución
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('asignaciones', 'write');
    const { id } = await params;
    const parsed = returnAssignmentSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(await registrarDevolucion(id, parsed.data, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al registrar devolución');
  }
}

// DELETE /api/asignaciones/[id] - Cancelar una asignación que no se ha devuelto
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('asignaciones', 'delete');
    const { id } = await params;
    await cancelarAsignacion(id, quienHace(session));
    return NextResponse.json({ message: "Asignación cancelada correctamente" });
  } catch (error) {
    return handleApiError(error, 'Error al cancelar asignación');
  }
}
