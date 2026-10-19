-- Normalizacion (SPEC 2.168): el equipo guardaba marca, sistema operativo,
-- antivirus y licencia Microsoft 365 como texto; ahora los referencia por la
-- llave de su catalogo. Nada se pierde:
--   1. Se compara sin importar mayusculas ni espacios de sobra ("DELL " = "Dell").
--   2. Los nombres usados que no estan en su catalogo se agregan (activos), uno
--      por nombre. Una marca vacia queda como "Sin marca"; un texto opcional vacio, sin valor.
--   3. Cada equipo toma el id de su opcion (la escrita igual, si hay; si no, la activa).
--   4. Se revisa que todo calce y recien entonces se quitan las columnas de texto.

-- 1. Columnas nuevas (todavia sin obligar) y textos vacios.
ALTER TABLE "assets"
  ADD COLUMN "marca_id" TEXT,
  ADD COLUMN "sistema_operativo_id" TEXT,
  ADD COLUMN "antivirus_id" TEXT,
  ADD COLUMN "licencia_microsoft365_id" TEXT;

UPDATE "assets" SET "marca" = 'Sin marca' WHERE btrim("marca") = '';
UPDATE "assets" SET "sistema_operativo" = NULL WHERE btrim("sistema_operativo") = '';
UPDATE "assets" SET "antivirus" = NULL WHERE btrim("antivirus") = '';
UPDATE "assets" SET "tipo_licencia_microsoft365" = NULL WHERE btrim("tipo_licencia_microsoft365") = '';

-- 2. Opciones que faltan en su catalogo: una por nombre (sin importar mayusculas).
INSERT INTO "marcas" ("id", "nombre", "activo")
SELECT gen_random_uuid()::text, v, true FROM (
  SELECT DISTINCT ON (lower(btrim("marca"))) btrim("marca") AS v FROM "assets" ORDER BY lower(btrim("marca")), btrim("marca")
) n
WHERE NOT EXISTS (SELECT 1 FROM "marcas" c WHERE lower(btrim(c."nombre")) = lower(n.v));

INSERT INTO "sistemas_operativos" ("id", "nombre", "activo")
SELECT gen_random_uuid()::text, v, true FROM (
  SELECT DISTINCT ON (lower(btrim("sistema_operativo"))) btrim("sistema_operativo") AS v FROM "assets"
  WHERE "sistema_operativo" IS NOT NULL ORDER BY lower(btrim("sistema_operativo")), btrim("sistema_operativo")
) n
WHERE NOT EXISTS (SELECT 1 FROM "sistemas_operativos" c WHERE lower(btrim(c."nombre")) = lower(n.v));

INSERT INTO "antivirus_opciones" ("id", "nombre", "activo")
SELECT gen_random_uuid()::text, v, true FROM (
  SELECT DISTINCT ON (lower(btrim("antivirus"))) btrim("antivirus") AS v FROM "assets"
  WHERE "antivirus" IS NOT NULL ORDER BY lower(btrim("antivirus")), btrim("antivirus")
) n
WHERE NOT EXISTS (SELECT 1 FROM "antivirus_opciones" c WHERE lower(btrim(c."nombre")) = lower(n.v));

INSERT INTO "licencias_microsoft365" ("id", "nombre", "activo")
SELECT gen_random_uuid()::text, v, true FROM (
  SELECT DISTINCT ON (lower(btrim("tipo_licencia_microsoft365"))) btrim("tipo_licencia_microsoft365") AS v FROM "assets"
  WHERE "tipo_licencia_microsoft365" IS NOT NULL ORDER BY lower(btrim("tipo_licencia_microsoft365")), btrim("tipo_licencia_microsoft365")
) n
WHERE NOT EXISTS (SELECT 1 FROM "licencias_microsoft365" c WHERE lower(btrim(c."nombre")) = lower(n.v));

-- 3. Cada equipo toma el id de su opcion: la escrita igual si existe; si no, la activa; si no, la primera por nombre.
UPDATE "assets" a SET "marca_id" = (
  SELECT c."id" FROM "marcas" c WHERE lower(btrim(c."nombre")) = lower(btrim(a."marca"))
  ORDER BY (c."nombre" = btrim(a."marca")) DESC, c."activo" DESC, c."nombre" LIMIT 1
);
UPDATE "assets" a SET "sistema_operativo_id" = (
  SELECT c."id" FROM "sistemas_operativos" c WHERE lower(btrim(c."nombre")) = lower(btrim(a."sistema_operativo"))
  ORDER BY (c."nombre" = btrim(a."sistema_operativo")) DESC, c."activo" DESC, c."nombre" LIMIT 1
) WHERE a."sistema_operativo" IS NOT NULL;
UPDATE "assets" a SET "antivirus_id" = (
  SELECT c."id" FROM "antivirus_opciones" c WHERE lower(btrim(c."nombre")) = lower(btrim(a."antivirus"))
  ORDER BY (c."nombre" = btrim(a."antivirus")) DESC, c."activo" DESC, c."nombre" LIMIT 1
) WHERE a."antivirus" IS NOT NULL;
UPDATE "assets" a SET "licencia_microsoft365_id" = (
  SELECT c."id" FROM "licencias_microsoft365" c WHERE lower(btrim(c."nombre")) = lower(btrim(a."tipo_licencia_microsoft365"))
  ORDER BY (c."nombre" = btrim(a."tipo_licencia_microsoft365")) DESC, c."activo" DESC, c."nombre" LIMIT 1
) WHERE a."tipo_licencia_microsoft365" IS NOT NULL;

-- 4. Revision: ningun valor quedo sin su id. Si algo no calza, se detiene sin borrar.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "assets" WHERE "marca_id" IS NULL
       OR ("sistema_operativo" IS NOT NULL AND "sistema_operativo_id" IS NULL)
       OR ("antivirus" IS NOT NULL AND "antivirus_id" IS NULL)
       OR ("tipo_licencia_microsoft365" IS NOT NULL AND "licencia_microsoft365_id" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Normalizacion de catalogos de activos: hay valores sin su opcion; no se borro nada';
  END IF;
END $$;

-- 5. Se obliga la marca y se quitan las columnas de texto.
ALTER TABLE "assets" ALTER COLUMN "marca_id" SET NOT NULL;
DROP INDEX "assets_marca_idx";
ALTER TABLE "assets"
  DROP COLUMN "marca",
  DROP COLUMN "sistema_operativo",
  DROP COLUMN "antivirus",
  DROP COLUMN "tipo_licencia_microsoft365";

-- 6. Indices y llaves foraneas.
CREATE INDEX "assets_marca_id_idx" ON "assets"("marca_id");
CREATE INDEX "assets_sistema_operativo_id_idx" ON "assets"("sistema_operativo_id");
CREATE INDEX "assets_antivirus_id_idx" ON "assets"("antivirus_id");
CREATE INDEX "assets_licencia_microsoft365_id_idx" ON "assets"("licencia_microsoft365_id");

ALTER TABLE "assets" ADD CONSTRAINT "assets_marca_id_fkey" FOREIGN KEY ("marca_id") REFERENCES "marcas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_sistema_operativo_id_fkey" FOREIGN KEY ("sistema_operativo_id") REFERENCES "sistemas_operativos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_antivirus_id_fkey" FOREIGN KEY ("antivirus_id") REFERENCES "antivirus_opciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_licencia_microsoft365_id_fkey" FOREIGN KEY ("licencia_microsoft365_id") REFERENCES "licencias_microsoft365"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
