import { NextRequest, NextResponse } from "next/server";
import { updateEmployeeSchema } from "@/modules/personas";
import { requirePermission, handleApiError, respuestaDatosInvalidos, quienHace } from '@/shared/auth/guard';
import { detalleEmpleado, editarEmpleado } from '@/modules/personas/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/empleados/[id] - Persona por id o RUT
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('empleados', 'read');
    const { id } = await params;
    return NextResponse.json(await detalleEmpleado(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener empleado');
  }
}

// PUT /api/empleados/[id] - Actualizar empleado
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('empleados', 'write');
    const { id } = await params;
    const parsed = updateEmployeeSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(await editarEmpleado(id, parsed.data, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar empleado');
  }
}
