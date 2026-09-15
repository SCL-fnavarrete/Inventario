-- Elimina el estado "reutilizable" del ciclo de vida de los activos y lo
-- fusiona con "disponible" (15-sep-2026, SPEC 2.40).
--
-- Por que: "reutilizable" (equipo devuelto en buen estado) era indistinguible
-- de "disponible" a la hora de entregarlo -- el formulario de asignacion
-- aceptaba los dos por igual. Pero las alertas de stock del Dashboard
-- contaban SOLO los "disponible", asi que con diez notebooks devueltos y
-- listos para entregar el sistema igual avisaba "Sin Stock: Notebook".
-- Ademas, lo que ese estado intentaba expresar -- que el equipo ya se uso --
-- ya lo dice el campo `condicion` (nuevo/usado/danado), que es independiente
-- del estado. Es decir, metia la condicion del equipo dentro de su ciclo de
-- vida.
--
-- Postgres no permite quitar un valor de un enum con ALTER TYPE, asi que hay
-- que recrear el tipo: se pasan las filas al valor nuevo, se crea el enum sin
-- el valor, se mueve la columna y se descarta el tipo viejo.

-- 1. Los activos que estaban en "reutilizable" pasan a "disponible".
--    No se pierde informacion: que el equipo es usado ya esta en `condicion`,
--    y de quien volvio esta en su historial de asignaciones.
UPDATE "assets" SET "estado" = 'disponible' WHERE "estado" = 'reutilizable';

-- 2. Recrear el enum sin "reutilizable".
--    El DEFAULT de la columna se quita antes de cambiar el tipo y se repone
--    despues: Postgres no puede convertir un default que todavia apunta al
--    tipo viejo.
ALTER TABLE "assets" ALTER COLUMN "estado" DROP DEFAULT;

CREATE TYPE "EstadoActivo_new" AS ENUM ('disponible', 'asignado', 'en_mantencion', 'baja', 'vendido');

ALTER TABLE "assets"
  ALTER COLUMN "estado" TYPE "EstadoActivo_new"
  USING ("estado"::text::"EstadoActivo_new");

DROP TYPE "EstadoActivo";

ALTER TYPE "EstadoActivo_new" RENAME TO "EstadoActivo";

ALTER TABLE "assets" ALTER COLUMN "estado" SET DEFAULT 'disponible';
