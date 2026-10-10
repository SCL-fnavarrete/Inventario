-- La baja de una linea se elige de una lista de motivos propia (SPEC 2.140).
CREATE TABLE "motivos_baja_linea" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "clave" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "motivos_baja_linea_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "motivos_baja_linea_nombre_key" ON "motivos_baja_linea"("nombre");
CREATE UNIQUE INDEX "motivos_baja_linea_clave_key" ON "motivos_baja_linea"("clave");

-- "Otro" lleva clave: lo usa el sistema (pide detalle) y no se desactiva ni se elimina.
INSERT INTO "motivos_baja_linea" ("id", "nombre", "clave") VALUES
  (gen_random_uuid()::text, 'Se canceló el servicio', NULL),
  (gen_random_uuid()::text, 'Chip perdido o robado', NULL),
  (gen_random_uuid()::text, 'Cambio de operador', NULL),
  (gen_random_uuid()::text, 'Línea duplicada', NULL),
  (gen_random_uuid()::text, 'Ya no se usa', NULL),
  (gen_random_uuid()::text, 'Otro', 'otro');

ALTER TABLE "lineas_telefonicas" ADD COLUMN "motivo_baja_id" TEXT;
CREATE INDEX "lineas_telefonicas_motivo_baja_id_idx" ON "lineas_telefonicas"("motivo_baja_id");
-- RESTRICT: un motivo ya usado en una baja no se borra (es evidencia).
ALTER TABLE "lineas_telefonicas" ADD CONSTRAINT "lineas_telefonicas_motivo_baja_id_fkey"
  FOREIGN KEY ("motivo_baja_id") REFERENCES "motivos_baja_linea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
