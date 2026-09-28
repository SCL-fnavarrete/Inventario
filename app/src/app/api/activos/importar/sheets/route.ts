import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { exigirCupo } from "@/lib/utils/limiteUso";
import { validarArchivoExcel } from "@/lib/importacion/validarArchivo";
import { nombresDeHojas } from "@/lib/importacion/leerExcel";

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'write');
    exigirCupo(session.user.id, "importarArchivo");

    const formData = await request.formData();
    const buffer = await validarArchivoExcel(formData.get("file"));
    return NextResponse.json({ sheets: await nombresDeHojas(buffer) });
  } catch (error) {
    return handleApiError(error, 'Error al leer el archivo Excel');
  }
}
