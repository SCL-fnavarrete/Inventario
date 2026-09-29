import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { fichaEmpleado } from '@/modules/personas/servidor';

// GET /api/empleados/[id]/ficha - Ficha completa de una persona (la ficha azul), por id o RUT
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('empleados', 'read');
    const { id } = await params;
    return NextResponse.json(await fichaEmpleado(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener ficha del empleado');
  }
}
