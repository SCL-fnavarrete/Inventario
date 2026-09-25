-- Configuracion (SPEC 2.112): se elimina la sincronizacion con Microsoft y los datos de la empresa.
-- Ningun empleado venia de Microsoft y los datos de la empresa nunca se guardaron.

-- DropIndex
DROP INDEX "employees_microsoft_id_idx";

-- DropIndex
DROP INDEX "employees_microsoft_id_key";

-- AlterTable
ALTER TABLE "employees" DROP COLUMN "microsoft_id",
DROP COLUMN "origen_microsoft";

-- AlterTable
ALTER TABLE "system_config" DROP COLUMN "empresa_direccion",
DROP COLUMN "empresa_email",
DROP COLUMN "empresa_nombre",
DROP COLUMN "empresa_rut",
DROP COLUMN "empresa_sitio_web",
DROP COLUMN "empresa_telefono";

