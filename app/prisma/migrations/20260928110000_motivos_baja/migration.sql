-- Motivos de baja como lista administrable (SPEC 2.116.5). La mantencion de
-- baja apunta a su motivo para poder contar bajas por categoria; el texto
-- que ya guardaba ("Robo: detalle") sigue igual.
CREATE TABLE "motivos_baja" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "clave" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "motivos_baja_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "motivos_baja_nombre_key" ON "motivos_baja"("nombre");
CREATE UNIQUE INDEX "motivos_baja_clave_key" ON "motivos_baja"("clave");

-- Los cinco motivos de antes. "Extravío" y "Otro" llevan clave: los usa el
-- sistema y no se pueden desactivar ni eliminar.
INSERT INTO "motivos_baja" ("id", "nombre", "clave") VALUES
  (gen_random_uuid()::text, 'Obsolescencia', NULL),
  (gen_random_uuid()::text, 'Falla irreparable', NULL),
  (gen_random_uuid()::text, 'Robo', NULL),
  (gen_random_uuid()::text, 'Extravío', 'extravio'),
  (gen_random_uuid()::text, 'Otro', 'otro');

ALTER TABLE "maintenances" ADD COLUMN "motivo_baja_id" TEXT;
CREATE INDEX "maintenances_motivo_baja_id_idx" ON "maintenances"("motivo_baja_id");
-- RESTRICT: un motivo ya usado en una baja no se borra (es evidencia).
ALTER TABLE "maintenances" ADD CONSTRAINT "maintenances_motivo_baja_id_fkey"
  FOREIGN KEY ("motivo_baja_id") REFERENCES "motivos_baja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bajas ya registradas: su texto empieza con el nombre del motivo
-- ("Robo" o "Extravío: ..."). Las de texto libre quedan sin categoria.
UPDATE "maintenances" m
SET "motivo_baja_id" = mb."id"
FROM "motivos_baja" mb
WHERE m."motivo_baja" IS NOT NULL
  AND (m."motivo_baja" = mb."nombre" OR m."motivo_baja" LIKE mb."nombre" || ':%');
