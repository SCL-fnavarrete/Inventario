-- La baja ya no pasa por una mantencion (SPEC 2.140): el equipo y la linea guardan su propio motivo.

-- Equipo: motivo de la lista y el texto que se muestra.
ALTER TABLE "assets" ADD COLUMN "motivo_baja_id" TEXT;
ALTER TABLE "assets" ADD COLUMN "motivo_baja" TEXT;
CREATE INDEX "assets_motivo_baja_id_idx" ON "assets"("motivo_baja_id");
ALTER TABLE "assets" ADD CONSTRAINT "assets_motivo_baja_id_fkey" FOREIGN KEY ("motivo_baja_id") REFERENCES "motivos_baja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Los equipos que ya estaban de baja toman el motivo de su mantencion de baja
-- (la mas reciente) o, si no la tienen, el de su devolucion danada.
UPDATE "assets" a
SET "motivo_baja_id" = m."motivo_baja_id", "motivo_baja" = m."motivo_baja"
FROM (
  SELECT DISTINCT ON ("asset_id") "asset_id", "motivo_baja_id", "motivo_baja"
  FROM "maintenances"
  WHERE "motivo_baja_id" IS NOT NULL
  ORDER BY "asset_id", "fecha_realizada" DESC NULLS LAST, "created_at" DESC
) m
WHERE a."id" = m."asset_id" AND a."estado" = 'baja' AND a."motivo_baja_id" IS NULL;

UPDATE "assets" a
SET "motivo_baja_id" = d."motivo_baja_id", "motivo_baja" = d."nombre"
FROM (
  SELECT DISTINCT ON (s."asset_id") s."asset_id", s."motivo_baja_id", mb."nombre"
  FROM "assignments" s
  JOIN "motivos_baja" mb ON mb."id" = s."motivo_baja_id"
  ORDER BY s."asset_id", s."fecha_devolucion" DESC NULLS LAST, s."created_at" DESC
) d
WHERE a."id" = d."asset_id" AND a."estado" = 'baja' AND a."motivo_baja_id" IS NULL;

-- Linea: por que se dio de baja (texto libre).
ALTER TABLE "lineas_telefonicas" ADD COLUMN "motivo_baja" TEXT;
