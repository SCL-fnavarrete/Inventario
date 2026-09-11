-- Rediseño de Guias de Despacho (10-sep-2026): la guia deja de tener
-- "Tipo de Despacho" y un destinatario ligado a un Employee del sistema.
-- Ahora el receptor es siempre texto libre (RUT + nombre), porque no
-- siempre es un empleado onboardeado; la sede destino es obligatoria y
-- explicita; y el efecto sobre el activo (cambio de sede) ocurre de
-- inmediato al crear la guia, ya no depende de un estado "recibido". La
-- guia no se puede anular una vez creada -- solo tiene dos estados.

-- 1. Columnas nuevas del receptor (texto libre), nullable primero para
-- poder hacer backfill de las guias que ya existan.
ALTER TABLE "dispatch_guides" ADD COLUMN "receptor_nombre" TEXT;
ALTER TABLE "dispatch_guides" ADD COLUMN "receptor_rut" TEXT;

-- 2. Backfill desde los datos de destinatario que ya existian: el texto
-- libre si lo tenia, o los datos del empleado si el destinatario era un
-- registro del sistema.
UPDATE "dispatch_guides" g
SET "receptor_nombre" = COALESCE(
      g."destinatario_nombre",
      e."nombre" || ' ' || e."apellido_paterno" || COALESCE(' ' || e."apellido_materno", '')
    ),
    "receptor_rut" = COALESCE(g."destinatario_rut", e."rut")
FROM "employees" e
WHERE g."destinatario_id" = e."id";

UPDATE "dispatch_guides"
SET "receptor_nombre" = COALESCE("receptor_nombre", "destinatario_nombre", 'Sin especificar'),
    "receptor_rut" = COALESCE("receptor_rut", "destinatario_rut", 'Sin especificar')
WHERE "receptor_nombre" IS NULL OR "receptor_rut" IS NULL;

ALTER TABLE "dispatch_guides" ALTER COLUMN "receptor_nombre" SET NOT NULL;
ALTER TABLE "dispatch_guides" ALTER COLUMN "receptor_rut" SET NOT NULL;

-- 3. OT Chilexpress pasa a ser obligatoria -- las guias antiguas que no la
-- tenian quedan con un valor de relleno visible, para que se corrijan a
-- mano si hace falta.
UPDATE "dispatch_guides" SET "ot_chilexpress" = 'SIN-OT-' || "numero" WHERE "ot_chilexpress" IS NULL;
ALTER TABLE "dispatch_guides" ALTER COLUMN "ot_chilexpress" SET NOT NULL;

-- 4. Sede destino pasa a ser obligatoria. Backfill: si la guia ya tenia
-- sede_destino_id se mantiene; si no, se usa sede_origen_id como mejor
-- estimacion, y en ultimo caso cualquier sede existente (red de seguridad,
-- no deberia hacer falta con datos reales).
UPDATE "dispatch_guides" SET "sede_destino_id" = "sede_origen_id" WHERE "sede_destino_id" IS NULL AND "sede_origen_id" IS NOT NULL;
UPDATE "dispatch_guides" SET "sede_destino_id" = (SELECT "id" FROM "sedes" ORDER BY "created_at" LIMIT 1) WHERE "sede_destino_id" IS NULL;
ALTER TABLE "dispatch_guides" ALTER COLUMN "sede_destino_id" SET NOT NULL;

-- 5. Estado: de 4 valores a solo 2. 'recibido' pasa a 'realizado';
-- 'pendiente'/'despachado'/'anulado' pasan a 'despachado' (ya no existe un
-- estado "pendiente" ni "anulado" -- la guia siempre nace despachada).
CREATE TYPE "EstadoGuia_new" AS ENUM ('despachado', 'realizado');

ALTER TABLE "dispatch_guides" ALTER COLUMN "estado" DROP DEFAULT;

ALTER TABLE "dispatch_guides"
  ALTER COLUMN "estado" TYPE "EstadoGuia_new"
  USING (
    CASE "estado"::text
      WHEN 'recibido' THEN 'realizado'
      ELSE 'despachado'
    END
  )::"EstadoGuia_new";

ALTER TABLE "dispatch_guides" ALTER COLUMN "estado" SET DEFAULT 'despachado';

DROP TYPE "EstadoGuia";
ALTER TYPE "EstadoGuia_new" RENAME TO "EstadoGuia";

-- 6. Quitar columnas que ya no se usan. Al eliminar la columna, Postgres
-- elimina automaticamente cualquier FK/indice que dependa solo de ella
-- (destinatario_id -> employees, sede_origen_id -> sedes), no hace falta
-- borrarlos a mano antes.
ALTER TABLE "dispatch_guides"
  DROP COLUMN "origen",
  DROP COLUMN "destino",
  DROP COLUMN "tipo_despacho",
  DROP COLUMN "destinatario_id",
  DROP COLUMN "destinatario_nombre",
  DROP COLUMN "destinatario_rut",
  DROP COLUMN "sede_origen_id";

DROP TYPE "TipoDespacho";
