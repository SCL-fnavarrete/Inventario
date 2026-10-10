-- Lineas simples (SPEC 2.131, 07-oct-2026): una linea guarda solo su numero,
-- operador, tipo de chip, estado, a que celular o persona esta asociada y
-- observaciones. Se quitan plan, precio mensual, sede y la nota "responsable".
-- Los estados quedan en dos, Activa y Baja ("Disponible" es una linea activa sin
-- persona, se calcula). Los datos que se quitan no se recuperan.

-- 1. Estados: toda linea vigente pasa a Activa; las demas opciones se borran.
UPDATE "lineas_telefonicas"
SET "estado_id" = (SELECT "id" FROM "estados_linea" WHERE "clave" = 'activa'),
    "fecha_baja" = NULL
WHERE "estado_id" IN (
  SELECT "id" FROM "estados_linea" WHERE "clave" IN ('suspendida', 'portabilidad', 'por_confirmar')
);
DELETE FROM "estados_linea" WHERE "clave" IN ('suspendida', 'portabilidad', 'por_confirmar');
UPDATE "estados_linea" SET "nombre" = 'Baja' WHERE "clave" = 'baja';

-- 2. Historial: se borran los eventos de precio y de plan y se quitan del enum.
DELETE FROM "lineas_historial" WHERE "tipo" IN ('precio', 'plan');
ALTER TYPE "TipoEventoLinea" RENAME TO "TipoEventoLinea_old";
CREATE TYPE "TipoEventoLinea" AS ENUM ('creacion', 'importacion', 'estado', 'celular', 'persona', 'datos', 'eliminacion');
ALTER TABLE "lineas_historial"
  ALTER COLUMN "tipo" TYPE "TipoEventoLinea" USING ("tipo"::text::"TipoEventoLinea");
DROP TYPE "TipoEventoLinea_old";

-- 3. Columnas y tabla que se quitan.
ALTER TABLE "lineas_telefonicas"
  DROP COLUMN "plan_id",
  DROP COLUMN "precio_mensual",
  DROP COLUMN "sede_id",
  DROP COLUMN "responsable";
ALTER TABLE "lineas_tenencias"
  DROP COLUMN "responsable",
  DROP COLUMN "sede_id";
DROP TABLE "planes_linea";
