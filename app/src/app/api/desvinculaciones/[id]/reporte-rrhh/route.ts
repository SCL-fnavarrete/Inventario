import { NextResponse } from "next/server";

/**
 * Reporte RRHH de desvinculacion -- generador ELIMINADO (15-sep-2026,
 * SPEC 2.41).
 *
 * Se saco junto con la dependencia jsPDF/jspdf-autotable, que ya no se
 * usaba en ningun otro lugar del sistema (Solicitudes genera sus tres
 * documentos con plantillas React-PDF, ver
 * lib/services/documentGeneratorService.ts). Pedido explicito de Javier:
 * sacar jsPDF porque "solo estamos usando la de solicitudes".
 *
 * Este reporte no tiene todavia una plantilla React-PDF equivalente. Si se
 * necesita de nuevo, hay que reescribirlo con esas plantillas en vez de
 * reinstalar jsPDF.
 *
 * Queda como stub en vez de borrarse (mismo criterio usado con Proveedores,
 * SPEC 2.35, y con el acta de asignacion, SPEC 2.41): si algo la sigue
 * llamando conviene que responda un mensaje claro y no un 404 mudo. El
 * boton "Reporte RRHH" del detalle de desvinculacion ya se quito.
 */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "El reporte RRHH en PDF fue eliminado junto con la dependencia jsPDF. Si se necesita de nuevo, hay que reescribirlo con las plantillas React-PDF que usa Solicitudes.",
    },
    { status: 410 }
  );
}
