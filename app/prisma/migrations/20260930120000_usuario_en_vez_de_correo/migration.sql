-- SPEC 2.122: se inicia sesion con un usuario, no con el correo. El correo
-- queda opcional (para recuperar la contrasena a futuro).

-- Cuentas existentes: su usuario es lo que esta antes de la @, en
-- minusculas y solo con los caracteres permitidos. El correo se conserva:
-- con el se encuentra la cuenta en la auditoria anterior a este cambio.
ALTER TABLE "system_users" ADD COLUMN "usuario" TEXT;
UPDATE "system_users"
SET "usuario" = regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9._-]', '', 'g');

-- Si dos cuentas quedan con el mismo usuario, o uno queda muy corto, la
-- migracion se detiene: hay que resolverlo a mano antes, no adivinar.
DO $$
DECLARE
  malos TEXT;
BEGIN
  SELECT string_agg("email", ', ') INTO malos
  FROM "system_users" u
  WHERE length(u."usuario") < 3
     OR (SELECT count(*) FROM "system_users" o WHERE o."usuario" = u."usuario") > 1;
  IF malos IS NOT NULL THEN
    RAISE EXCEPTION 'Estas cuentas no tienen un usuario valido o lo repiten: %', malos;
  END IF;
END $$;

ALTER TABLE "system_users" ALTER COLUMN "usuario" SET NOT NULL;
ALTER TABLE "system_users" ALTER COLUMN "email" DROP NOT NULL;
CREATE UNIQUE INDEX "system_users_usuario_key" ON "system_users"("usuario");

-- Registro de accesos: la columna pasa a guardar el usuario escrito. Los
-- registros anteriores conservan el correo que se escribio.
ALTER TABLE "access_logs" RENAME COLUMN "email" TO "usuario_ingresado";
ALTER INDEX "access_logs_email_created_at_idx" RENAME TO "access_logs_usuario_ingresado_created_at_idx";
