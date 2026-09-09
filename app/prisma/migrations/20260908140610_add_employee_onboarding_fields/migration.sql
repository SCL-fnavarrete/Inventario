-- Agrega campos adicionales de onboarding al empleado (todos opcionales,
-- sin backfill necesario): division, area, sub-area, direccion particular
-- y listas de distribucion a las que debe sumarse.
ALTER TABLE "employees" ADD COLUMN "division" TEXT;
ALTER TABLE "employees" ADD COLUMN "area" TEXT;
ALTER TABLE "employees" ADD COLUMN "sub_area" TEXT;
ALTER TABLE "employees" ADD COLUMN "direccion_particular" TEXT;
ALTER TABLE "employees" ADD COLUMN "listas_distribucion" TEXT;
