import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, ValidationError } from '@/shared/auth/guard';
import { buscarEmpleadoPorRut } from '@/modules/personas/servidor';

// GET /api/empleados/buscar?rut=21.523.308-1 - Buscar una persona por RUT
export async function GET(request: NextRequest) {
  try {
    await requirePermission('empleados', 'read');
    const rut = request.nextUrl.searchParams.get("rut");
    if (!rut) throw new ValidationError("El RUT es requerido");
    const { empleado, rutFormateado } = await buscarEmpleadoPorRut(rut);
    // El 404 devuelve tambien el RUT buscado, ya formateado.
    if (!empleado) {
      return NextResponse.json({ error: "Empleado no encontrado", rut: rutFormateado }, { status: 404 });
    }
    return NextResponse.json(empleado);
  } catch (error) {
    return handleApiError(error, 'Error al buscar empleado');
  }
}
