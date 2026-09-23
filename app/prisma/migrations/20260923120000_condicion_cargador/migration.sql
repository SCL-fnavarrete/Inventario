-- Condicion del cargador: nombres profesionales y enum propio.
--   EstadoDevolucionTipo { ok, danado, no_aplica, pendiente }
--   -> CondicionCargador { operativo, con_danos, no_incluido }
-- Se recrea el tipo (en vez de RENAME VALUE) porque ademas se elimina
-- "pendiente", que no usa ningun codigo. Los datos existentes se convierten
-- con CASE; NULL sigue siendo NULL (equipo sin cargador).

-- Resguardo: si hubiera filas con 'pendiente' no hay un valor nuevo
-- equivalente, asi que se aborta en vez de adivinar.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "assignments"
    WHERE "condicion_cargador_entrega"::text = 'pendiente'
       OR "condicion_cargador_devolucion"::text = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'Hay asignaciones con condicion de cargador "pendiente": revisarlas antes de migrar';
  END IF;
END $$;

CREATE TYPE "CondicionCargador" AS ENUM ('operativo', 'con_danos', 'no_incluido');

ALTER TABLE "assignments"
  ALTER COLUMN "condicion_cargador_entrega" TYPE "CondicionCargador"
    USING (CASE "condicion_cargador_entrega"::text
             WHEN 'ok' THEN 'operativo'
             WHEN 'danado' THEN 'con_danos'
             WHEN 'no_aplica' THEN 'no_incluido'
           END)::"CondicionCargador",
  ALTER COLUMN "condicion_cargador_devolucion" TYPE "CondicionCargador"
    USING (CASE "condicion_cargador_devolucion"::text
             WHEN 'ok' THEN 'operativo'
             WHEN 'danado' THEN 'con_danos'
             WHEN 'no_aplica' THEN 'no_incluido'
           END)::"CondicionCargador";

DROP TYPE "EstadoDevolucionTipo";
