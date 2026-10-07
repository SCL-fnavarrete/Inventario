-- Sede de las lineas y tipos de chip "sin celular" (SPEC 2.131): la linea
-- guarda la sede donde esta (reemplaza al texto libre "responsable o
-- ubicacion") y el tipo de chip dice si va sin celular de la empresa (eSIM / MFF).

-- AlterTable
ALTER TABLE "lineas_telefonicas" ADD COLUMN "sede_id" TEXT;
ALTER TABLE "lineas_tenencias" ADD COLUMN "sede_id" TEXT;
ALTER TABLE "tipos_chip" ADD COLUMN "sin_celular" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "lineas_telefonicas_sede_id_idx" ON "lineas_telefonicas"("sede_id");

-- AddForeignKey
ALTER TABLE "lineas_telefonicas" ADD CONSTRAINT "lineas_telefonicas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lineas_tenencias" ADD CONSTRAINT "lineas_tenencias_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- eSIM / MFF no va en un celular de la empresa.
UPDATE "tipos_chip" SET "sin_celular" = true WHERE "nombre" = 'eSIM / MFF';

-- El texto libre que nombra una sola sede ("Bodega Concepción") pasa a esa sede
-- y deja de ser texto; el que no calza con ninguna queda como nota.
UPDATE "lineas_telefonicas" l
SET "sede_id" = s."id", "responsable" = NULL
FROM "sedes" s
WHERE l."responsable" IS NOT NULL
  AND position(lower(s."nombre") in lower(l."responsable")) > 0
  AND (SELECT count(*) FROM "sedes" s2 WHERE position(lower(s2."nombre") in lower(l."responsable")) > 0) = 1;

UPDATE "lineas_tenencias" t
SET "sede_id" = s."id", "responsable" = NULL
FROM "sedes" s
WHERE t."responsable" IS NOT NULL
  AND position(lower(s."nombre") in lower(t."responsable")) > 0
  AND (SELECT count(*) FROM "sedes" s2 WHERE position(lower(s2."nombre") in lower(t."responsable")) > 0) = 1;

-- Una linea con celular, sin sede, toma la del celular.
UPDATE "lineas_telefonicas" l
SET "sede_id" = a."sede_id"
FROM "assets" a
WHERE l."activo_id" = a."id" AND l."sede_id" IS NULL AND a."sede_id" IS NOT NULL;

UPDATE "lineas_tenencias" t
SET "sede_id" = a."sede_id"
FROM "assets" a
WHERE t."activo_id" = a."id" AND t."sede_id" IS NULL AND a."sede_id" IS NOT NULL;
