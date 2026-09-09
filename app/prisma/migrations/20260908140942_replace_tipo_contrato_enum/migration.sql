-- Reemplaza el enum TipoContrato (planta/proyecto/externo) por dos valores
-- que reflejan si la relacion es con SCL (contrato) o externa (boleta).
-- Mapeo de datos existentes: planta y proyecto -> contrato, externo -> boleta.
--
-- Postgres no permite eliminar valores de un enum ni "encogerlo" en el
-- mismo tipo, asi que se crea un tipo nuevo, se migra la columna con
-- USING (con el mapeo de arriba) y se reemplaza el tipo antiguo por el
-- nuevo bajo el mismo nombre.

CREATE TYPE "TipoContrato_new" AS ENUM ('contrato', 'boleta');

ALTER TABLE "employees"
  ALTER COLUMN "tipo_contrato" TYPE "TipoContrato_new"
  USING (
    CASE "tipo_contrato"::text
      WHEN 'planta' THEN 'contrato'
      WHEN 'proyecto' THEN 'contrato'
      WHEN 'externo' THEN 'boleta'
    END
  )::"TipoContrato_new";

DROP TYPE "TipoContrato";
ALTER TYPE "TipoContrato_new" RENAME TO "TipoContrato";
