import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from "@/shared/utilidades/limiteUso";
import { leerFiltrosActivos } from '@/modules/activos';
import { excelDeActivos } from '@/modules/activos/excel';

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'read');
    exigirCupo(session.user.id, "exportar");
    const { buffer, nombreArchivo } = await excelDeActivos(leerFiltrosActivos(request.nextUrl.searchParams));
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al exportar activos');
  }
}
