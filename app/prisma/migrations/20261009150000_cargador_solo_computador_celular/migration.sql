-- Solo los computadores y los celulares llevan cargador (SPEC 2.142): el estado del cargador
-- se pregunta unicamente con ellos. Los demas equipos quedaban con cargador por el valor por defecto.
UPDATE "assets" SET "tiene_cargador" = false
WHERE "tiene_cargador" = true
  AND "categoria_id" IN (SELECT "id" FROM "asset_categories" WHERE "tipo_ficha" NOT IN ('computador', 'celular'));

ALTER TABLE "assets" ALTER COLUMN "tiene_cargador" SET DEFAULT false;
