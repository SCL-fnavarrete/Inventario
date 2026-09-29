import { NextRequest, NextResponse } from "next/server";
import type { CorrectedRow } from "@/modules/importacion";
import { importarTanda } from "@/modules/importacion/servidor";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from "@/shared/utilidades/limiteUso";

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

// Importa una tanda de filas ya revisadas en la vista previa (unico punto
// donde la importacion escribe; ver importarTanda).
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, "importarTanda");
    const body = (await request.json()) as { categoria: string; rows: CorrectedRow[]; sedeId?: string };
    return NextResponse.json(await importarTanda(body, session));
  } catch (error) {
    return handleApiError(error, 'Error al importar activos');
  }
}
