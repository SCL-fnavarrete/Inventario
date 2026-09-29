import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from "@/shared/utilidades/limiteUso";
import { validarArchivoExcel } from "@/modules/importacion/validarArchivo";
import { nombresDeHojas } from "@/modules/importacion/leerExcel";

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, "importarArchivo");

    const formData = await request.formData();
    const buffer = await validarArchivoExcel(formData.get("file"));
    return NextResponse.json({ sheets: await nombresDeHojas(buffer) });
  } catch (error) {
    return handleApiError(error, 'Error al leer el archivo Excel');
  }
}
