-- La sede Peru (PERU) entra con las migraciones, igual que Santiago y
-- Concepcion (20260909160000_sede_activos_guias); antes la creaba el seed.
-- Si ya existe (por ejemplo, porque ya se corrio el seed), no hace nada.
INSERT INTO "sedes" ("id", "codigo", "nombre", "activa", "created_at", "updated_at")
VALUES (gen_random_uuid()::text, 'PERU', 'Perú', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("codigo") DO NOTHING;
