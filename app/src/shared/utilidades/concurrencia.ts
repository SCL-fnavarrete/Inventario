import { Prisma } from "@prisma/client";
import { ConflictError } from "@/shared/errores";

export const MENSAJE_CAMBIO_SIMULTANEO =
  "El registro cambió mientras se guardaba (otra persona o pestaña). Vuelve a cargar la página.";

/**
 * Escritura condicionada: el `update` lleva en su `where` el estado que se
 * leyó (ej. `{ id, estado: 'en_proceso' }`). Si otra operación lo cambió en
 * el intertanto, Prisma no encuentra la fila (P2025) y aquí se responde 409
 * en vez de pisar el cambio ajeno. Evita, por ejemplo, completar dos veces
 * una mantención o vender un equipo que se acaba de entregar.
 */
export async function siSigueIgual<T>(escritura: Promise<T>, mensaje = MENSAJE_CAMBIO_SIMULTANEO): Promise<T> {
  try {
    return await escritura;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new ConflictError(mensaje);
    }
    throw error;
  }
}
