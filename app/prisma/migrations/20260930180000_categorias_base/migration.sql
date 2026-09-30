-- Las categorias de activos base entran con las migraciones, como las sedes y
-- los demas catalogos; antes las creaba el seed. tipo_ficha decide los campos
-- especiales del formulario (SPEC 2.112.7). Las que ya existen (por nombre) no
-- se tocan.
INSERT INTO "asset_categories" ("id", "nombre", "descripcion", "tipo_ficha", "created_at")
VALUES
  (gen_random_uuid()::text, 'Notebook', 'Computadores portátiles', 'computador', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Celular', 'Teléfonos móviles corporativos', 'celular', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Monitor', 'Pantallas y monitores', 'monitor', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Mouse', 'Mouse y dispositivos de entrada', 'periferico', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Teclado', 'Teclados', 'periferico', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Webcam', 'Cámaras web', 'periferico', CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Audífonos', 'Audífonos y headsets', 'periferico', CURRENT_TIMESTAMP)
ON CONFLICT ("nombre") DO NOTHING;
