-- Estados de una linea fijos (SPEC 2.131, v2.65): Activa, Suspendida, En
-- portabilidad y Dada de baja son los unicos y no se agregan ni se cambian
-- desde la aplicacion. Cada uno lleva su clave.
UPDATE "estados_linea" SET "clave" = 'suspendida' WHERE "nombre" = 'Suspendida' AND "clave" IS NULL;
UPDATE "estados_linea" SET "clave" = 'portabilidad' WHERE "nombre" = 'En portabilidad' AND "clave" IS NULL;

-- Un estado creado a mano que no usa ninguna linea sobra: se quita.
DELETE FROM "estados_linea" e
WHERE e."clave" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "lineas_telefonicas" l WHERE l."estado_id" = e."id");
