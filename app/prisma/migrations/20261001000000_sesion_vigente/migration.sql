-- SPEC 2.127: una sola sesion por usuario (gana la ultima).
-- AlterTable
ALTER TABLE "system_users" ADD COLUMN     "sesion_vigente_id" TEXT;

