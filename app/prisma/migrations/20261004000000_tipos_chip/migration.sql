-- Tipo de chip de las lineas, como catalogo (SPEC 2.131), y la persona de
-- una linea con celular pasa a ser la del celular.

-- CreateTable
CREATE TABLE "tipos_chip" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipos_chip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_chip_nombre_key" ON "tipos_chip"("nombre");

-- Los dos tipos de base
INSERT INTO "tipos_chip" ("id", "nombre") VALUES
  (gen_random_uuid()::text, 'Chip físico'),
  (gen_random_uuid()::text, 'eSIM')
ON CONFLICT ("nombre") DO NOTHING;

-- AlterTable
ALTER TABLE "lineas_telefonicas" ADD COLUMN "tipo_chip_id" TEXT;

-- CreateIndex
CREATE INDEX "lineas_telefonicas_tipo_chip_id_idx" ON "lineas_telefonicas"("tipo_chip_id");

-- AddForeignKey
ALTER TABLE "lineas_telefonicas" ADD CONSTRAINT "lineas_telefonicas_tipo_chip_id_fkey" FOREIGN KEY ("tipo_chip_id") REFERENCES "tipos_chip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Con celular, la persona es la del celular: no se guarda en la linea.
UPDATE "lineas_telefonicas" SET "empleado_id" = NULL WHERE "activo_id" IS NOT NULL;
