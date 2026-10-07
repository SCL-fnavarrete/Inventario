-- Impresora vuelve a ser categoria base (SPEC 2.127): se usa en la importacion
-- de los Excel de otros activos. Ficha generica: lo basico mas los campos
-- generales (sin seccion propia, ver 2.11). Si ya existe (por nombre) no se toca.
INSERT INTO "asset_categories" ("id", "nombre", "descripcion", "tipo_ficha", "created_at")
VALUES (gen_random_uuid()::text, 'Impresora', 'Impresoras y multifuncionales', 'generico', CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;
