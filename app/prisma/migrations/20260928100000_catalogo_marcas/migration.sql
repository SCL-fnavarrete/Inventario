-- Catalogo de marcas (SPEC 2.116.4). El activo sigue guardando la marca
-- como texto: esta tabla solo alimenta el selector y la importacion.
CREATE TABLE "marcas" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "marcas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "marcas_nombre_key" ON "marcas"("nombre");

-- Marcas de partida, con la escritura oficial ("HP", no "Hp").
INSERT INTO "marcas" ("id", "nombre")
SELECT gen_random_uuid()::text, nombre
FROM unnest(ARRAY['Acer', 'Asus', 'Dell', 'HP', 'Huawei', 'Lenovo', 'Samsung']) AS nombre;

-- Los activos que escriben una de esas marcas con otras mayusculas o
-- espacios pasan a la escritura oficial ("Hp" -> "HP").
UPDATE "assets" a
SET "marca" = m."nombre"
FROM "marcas" m
WHERE lower(trim(a."marca")) = lower(m."nombre") AND a."marca" <> m."nombre";

-- Cualquier otra marca que ya usen los activos entra al catalogo, una por
-- nombre ignorando mayusculas (la primera variante en orden alfabetico).
INSERT INTO "marcas" ("id", "nombre")
SELECT gen_random_uuid()::text, nombre FROM (
  SELECT DISTINCT ON (lower(trim("marca"))) trim("marca") AS nombre
  FROM "assets"
  WHERE trim("marca") <> ''
    AND lower(trim("marca")) NOT IN (SELECT lower("nombre") FROM "marcas")
  ORDER BY lower(trim("marca")), "marca"
) t;
