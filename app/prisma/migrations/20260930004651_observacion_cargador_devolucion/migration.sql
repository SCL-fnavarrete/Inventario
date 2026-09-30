-- SPEC 2.121: la observacion del cargador se separa en una de entrega (la
-- columna existente, observaciones_cargador) y una de devolucion (nueva).
-- Antes era una sola y la devolucion pisaba la de la entrega.

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "observaciones_cargador_devolucion" TEXT;

-- Datos existentes: si la asignacion ya se devolvio (o quedo "no devuelto")
-- y esa devolucion registro la condicion del cargador, la observacion
-- guardada la escribio la devolucion: pasa a su columna. En los demas casos
-- se queda como observacion de la entrega.
UPDATE "assignments"
SET "observaciones_cargador_devolucion" = "observaciones_cargador",
    "observaciones_cargador" = NULL
WHERE "estado_devolucion" IS NOT NULL
  AND "condicion_cargador_devolucion" IS NOT NULL;
