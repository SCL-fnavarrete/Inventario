import { NextResponse } from "next/server";

/**
 * Acta de entrega/devolucion por asignacion -- eliminada. Los documentos
 * del proceso (entrega, cambio, devolucion) ahora se generan desde el
 * modulo de Solicitudes (ver lib/services/documentGeneratorService.ts).
 *
 * Queda como stub, en vez de borrarse, para responder un mensaje claro si
 * algo todavia apunta a esta ruta, en vez de un 404 mudo.
 */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "El acta por asignación fue eliminada. Los documentos de entrega, cambio y devolución se generan desde el módulo de Solicitudes.",
    },
    { status: 410 }
  );
}
