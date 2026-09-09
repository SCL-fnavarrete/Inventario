-- Separa el correo del empleado en dos campos: personal (el que hoy existe,
-- se renombra conservando su valor y su restriccion unica) y empresa
-- (nuevo, opcional, lo llenara la sincronizacion con Microsoft con el correo
-- corporativo que trae Azure AD).
ALTER TABLE "employees" RENAME COLUMN "correo" TO "correo_personal";
ALTER INDEX "employees_correo_key" RENAME TO "employees_correo_personal_key";

ALTER TABLE "employees" ADD COLUMN "correo_empresa" TEXT;
CREATE UNIQUE INDEX "employees_correo_empresa_key" ON "employees"("correo_empresa");
