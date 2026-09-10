-- Tipos de mantencion dinamicos (9-sep-2026): antes eran un enum fijo
-- (TipoMantencion) en la columna "maintenances"."tipo". Se reemplaza por
-- una tabla real "maintenance_types" para que admin y tecnico puedan
-- crear/editar/eliminar tipos sin tocar codigo ni deploy.

-- 1. Crear la tabla nueva
CREATE TABLE "maintenance_types" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "maintenance_types_nombre_key" ON "maintenance_types"("nombre");

-- 2. Semilla: los 5 valores que existian como enum fijo, para no perder
-- los tipos que ya estan en uso por mantenciones existentes.
INSERT INTO "maintenance_types" ("id", "nombre", "descripcion", "activo", "created_at", "updated_at") VALUES
  (gen_random_uuid()::text, 'Preventiva', 'Mantención programada regular', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Correctiva', 'Reparación de fallo o problema', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Actualización SO', 'Actualización de sistema operativo', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Limpieza', 'Limpieza física y lógica', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Reparación', 'Reparación de hardware o software', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 3. Agregar la columna nueva (nullable primero, para poder rellenarla)
ALTER TABLE "maintenances" ADD COLUMN "tipo_id" TEXT;

-- 4. Backfill: mapear el enum viejo al id del tipo equivalente
UPDATE "maintenances" m
SET "tipo_id" = mt."id"
FROM "maintenance_types" mt
WHERE
  (m."tipo" = 'preventiva' AND mt."nombre" = 'Preventiva') OR
  (m."tipo" = 'correctiva' AND mt."nombre" = 'Correctiva') OR
  (m."tipo" = 'actualizacion_so' AND mt."nombre" = 'Actualización SO') OR
  (m."tipo" = 'limpieza' AND mt."nombre" = 'Limpieza') OR
  (m."tipo" = 'reparacion' AND mt."nombre" = 'Reparación');

-- 5. Red de seguridad: si alguna fila quedo sin mapear (no deberia pasar
-- con los 5 valores del enum), se asigna Preventiva para no bloquear el
-- NOT NULL del siguiente paso.
UPDATE "maintenances" SET "tipo_id" = (SELECT "id" FROM "maintenance_types" WHERE "nombre" = 'Preventiva')
WHERE "tipo_id" IS NULL;

ALTER TABLE "maintenances" ALTER COLUMN "tipo_id" SET NOT NULL;

ALTER TABLE "maintenances" ADD CONSTRAINT "maintenances_tipo_id_fkey" FOREIGN KEY ("tipo_id") REFERENCES "maintenance_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "maintenances_tipo_id_idx" ON "maintenances"("tipo_id");

-- 6. Quitar la columna vieja y el enum, ya no se usan
DROP INDEX IF EXISTS "maintenances_tipo_idx";

ALTER TABLE "maintenances" DROP COLUMN "tipo";

DROP TYPE "TipoMantencion";
