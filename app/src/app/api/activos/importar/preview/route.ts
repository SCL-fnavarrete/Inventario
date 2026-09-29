import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, ValidationError } from '@/shared/auth/guard';
import { exigirCupo } from "@/shared/utilidades/limiteUso";
import { validarArchivoExcel } from "@/modules/importacion";
import { vistaPreviaImportacion } from "@/modules/importacion/servidor";

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

// Vista previa de un Excel: valida sin escribir nada (ver vistaPreviaImportacion).
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, "importarArchivo");

    const formData = await request.formData();
    const sheetName = formData.get("sheetName") as string;
    if (!sheetName) throw new ValidationError("Faltan parámetros requeridos");
    const mappingStr = formData.get("mapping") as string;
    const correctionsStr = formData.get("corrections") as string | null;

    const resultado = await vistaPreviaImportacion({
      buffer: await validarArchivoExcel(formData.get("file")),
      sheetName,
      categoria: formData.get("categoria") as string,
      mapping: mappingStr ? (JSON.parse(mappingStr) as Record<string, string>) : null,
      corrections: correctionsStr ? JSON.parse(correctionsStr) : {},
      sedeId: formData.get("sedeId") as string | null,
      session,
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error, 'Error al procesar el archivo Excel');
  }
}
