-- Reduce SystemRole a solo admin/tecnico. supervisor/rrhh/auditor no se
-- usaban en la practica (ver permissions.ts) -- este sistema es de soporte.
--
-- Postgres no permite quitar valores de un enum directamente (no existe
-- "DROP VALUE"): hay que recrear el tipo. Antes de eso, cualquier cuenta
-- que hoy tenga uno de los roles retirados se reasigna a "tecnico" -- son
-- cuentas de solo lectura que nunca escribian nada operativo, asi que
-- "tecnico" es lo mas parecido a "sigue pudiendo entrar y ver lo suyo" sin
-- dejar a nadie con una cuenta rota.

-- 1. Sacar la columna del control del enum viejo.
ALTER TABLE "system_users" ALTER COLUMN "rol" TYPE TEXT;

-- 2. Reasignar roles retirados.
UPDATE "system_users" SET "rol" = 'tecnico' WHERE "rol" NOT IN ('admin', 'tecnico');

-- 3. Recrear el enum con solo los dos valores vigentes.
DROP TYPE "SystemRole";
CREATE TYPE "SystemRole" AS ENUM ('admin', 'tecnico');

-- 4. Devolver la columna al enum nuevo.
ALTER TABLE "system_users" ALTER COLUMN "rol" TYPE "SystemRole" USING "rol"::"SystemRole";
