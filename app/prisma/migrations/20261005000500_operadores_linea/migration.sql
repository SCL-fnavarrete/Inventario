-- Operador de las lineas (SPEC 2.131): catalogo seleccionable (Entel, Movistar...)
-- y la columna en la linea. Las lineas que ya existen quedan sin operador.

-- CreateTable
CREATE TABLE "operadores_linea" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operadores_linea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operadores_linea_nombre_key" ON "operadores_linea"("nombre");

-- AlterTable
ALTER TABLE "lineas_telefonicas" ADD COLUMN "operador_id" TEXT;

-- CreateIndex
CREATE INDEX "lineas_telefonicas_operador_id_idx" ON "lineas_telefonicas"("operador_id");

-- AddForeignKey
ALTER TABLE "lineas_telefonicas" ADD CONSTRAINT "lineas_telefonicas_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "operadores_linea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Operadores de base (se pueden agregar mas).
INSERT INTO "operadores_linea" ("id", "nombre") VALUES
    (gen_random_uuid()::text, 'Entel'),
    (gen_random_uuid()::text, 'Movistar'),
    (gen_random_uuid()::text, 'Claro'),
    (gen_random_uuid()::text, 'WOM')
ON CONFLICT ("nombre") DO NOTHING;
