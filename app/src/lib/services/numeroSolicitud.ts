import type { Prisma } from "@prisma/client";

/**
 * Siguiente numero de solicitud del año: WF-2026-0001, WF-2026-0002...
 *
 * El mayor correlativo lo calcula la base en una sola consulta (auditoria
 * 27-sep-2026, 2.9); antes se traian todas las solicitudes del año. Se
 * compara como numero y no como texto: ordenar el texto pondria
 * "WF-2026-9999" despues de "WF-2026-10000". Si dos creaciones simultaneas
 * obtienen el mismo numero, la unicidad de `numero` rechaza una y la ruta
 * reintenta (ver INTENTOS_NUMERO en POST /api/solicitudes).
 */
export async function generarNumeroSolicitud(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  ahora = new Date()
): Promise<string> {
  const prefijo = `WF-${ahora.getFullYear()}-`;
  const desde = prefijo.length + 1;
  const [fila] = await tx.$queryRaw<{ mayor: number }[]>`
    SELECT COALESCE(MAX(CAST(substring(numero FROM ${desde}::int) AS INTEGER)), 0)::int AS mayor
    FROM workflow_requests
    WHERE numero LIKE ${`${prefijo}%`}
      AND substring(numero FROM ${desde}::int) ~ '^[0-9]+$'`;
  const mayor = Number(fila?.mayor ?? 0);
  return `${prefijo}${String(mayor + 1).padStart(4, "0")}`;
}
