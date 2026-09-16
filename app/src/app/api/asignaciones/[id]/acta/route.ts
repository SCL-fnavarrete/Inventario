import { NextResponse } from "next/server";

/**
 * Acta de entrega/devolucion por asignacion -- ELIMINADA (15-sep-2026,
 * SPEC 2.41).
 *
 * Pedido explicito de Javier: "el tema de crear esa acta con ese formato,
 * borralo. No se va a usar. Ya que ya lo tenemos en solicitudes".
 *
 * Por que se puede sacar sin dejar hueco: los documentos del proceso ya los
 * genera el modulo de Solicitudes, con plantillas propias (ver
 * lib/services/documentGeneratorService.ts):
 *   - generateAnexoEntrega      -> entrega de equipos en un onboarding
 *   - generateComprobanteCambio -> cambio de equipo
 *   - generateActaDevolucion    -> devolucion en una desvinculacion
 *
 * Esta ruta era un segundo generador, hecho con jsPDF en vez de las
 * plantillas React-PDF del resto del sistema, que producia un documento con
 * otro formato para el mismo hecho. Tener dos actas distintas para la misma
 * entrega es peor que tener una sola.
 *
 * Queda como stub en vez de borrarse (mismo criterio usado con Proveedores,
 * SPEC 2.35): si algo la sigue llamando -- un enlace guardado, un marcador
 * del navegador -- conviene que responda un mensaje claro y no un 404 mudo.
 * Los tres enlaces que tenia el sistema ya se quitaron.
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
