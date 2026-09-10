-- Sede (site/location) tracking for assets and dispatch guides.
-- See SPEC 2.9.

-- 1. Nuevo valor de TipoEvento para historial de traslados de sede.
ALTER TYPE "TipoEvento" ADD VALUE 'traslado';

-- 2. Tabla de sedes.
CREATE TABLE "sedes" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sedes_codigo_key" ON "sedes"("codigo");

-- Sedes conocidas iniciales (Santiago y Concepción).
INSERT INTO "sedes" ("id", "codigo", "nombre", "activa", "created_at", "updated_at")
VALUES
    (gen_random_uuid()::text, 'STGO', 'Santiago', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid()::text, 'CCP', 'Concepción', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 3. Asset.sedeId
ALTER TABLE "assets" ADD COLUMN "sede_id" TEXT;
CREATE INDEX "assets_sede_id_idx" ON "assets"("sede_id");
ALTER TABLE "assets" ADD CONSTRAINT "assets_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. DispatchGuide: sede origen/destino + datos de envio por OT.
ALTER TABLE "dispatch_guides" ADD COLUMN "sede_origen_id" TEXT;
ALTER TABLE "dispatch_guides" ADD COLUMN "sede_destino_id" TEXT;
ALTER TABLE "dispatch_guides" ADD COLUMN "ot_chilexpress" TEXT;
ALTER TABLE "dispatch_guides" ADD COLUMN "fecha_estimada_llegada" TIMESTAMP(3);

CREATE INDEX "dispatch_guides_sede_origen_id_idx" ON "dispatch_guides"("sede_origen_id");
CREATE INDEX "dispatch_guides_sede_destino_id_idx" ON "dispatch_guides"("sede_destino_id");

ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_sede_origen_id_fkey" FOREIGN KEY ("sede_origen_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_sede_destino_id_fkey" FOREIGN KEY ("sede_destino_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
