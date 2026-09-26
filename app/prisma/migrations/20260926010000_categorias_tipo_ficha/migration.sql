-- CreateEnum
CREATE TYPE "TipoFicha" AS ENUM ('computador', 'celular', 'monitor', 'periferico', 'generico');

-- AlterEnum
ALTER TYPE "AuditEntidad" ADD VALUE 'catalogo';

-- AlterTable
ALTER TABLE "asset_categories" ADD COLUMN     "tipo_ficha" "TipoFicha" NOT NULL DEFAULT 'generico';


-- Las categorias actuales quedan con el tipo de ficha que antes se deducia
-- de su nombre (SPEC 2.112.8). Desde ahora lo decide este campo.
UPDATE "asset_categories" SET "tipo_ficha" = 'computador'
  WHERE lower("nombre") LIKE '%notebook%' OR lower("nombre") LIKE '%laptop%' OR lower("nombre") LIKE '%computador%';
UPDATE "asset_categories" SET "tipo_ficha" = 'celular'
  WHERE lower("nombre") LIKE '%celular%' OR lower("nombre") LIKE '%smartphone%';
UPDATE "asset_categories" SET "tipo_ficha" = 'monitor'
  WHERE lower("nombre") LIKE '%monitor%';
UPDATE "asset_categories" SET "tipo_ficha" = 'periferico'
  WHERE lower("nombre") IN ('mouse', 'teclado', 'webcam', 'audífonos', 'audifonos');
