-- Invierte cual de los dos correos del empleado es obligatorio, y deja el
-- tipo de contrato opcional (15-sep-2026, SPEC 2.39).
--
-- Contexto: antes de cargar el inventario real se detecto que el modelo
-- pedia como obligatorio el correo PERSONAL, que en la practica nadie
-- registra, mientras dejaba opcional el de EMPRESA, que es el que siempre
-- existe y con el que TI identifica a cada persona. Y exigia un tipo de
-- contrato que las planillas de origen no traen, obligando a inventar un
-- valor para ~110 personas.
--
-- IMPORTANTE: `correo_empresa` pasa a NOT NULL. Esto solo corre limpio si
-- todas las filas existentes ya tienen ese dato. El paso de respaldo de mas
-- abajo cubre el caso de una base con empleados cargados antes de este
-- cambio: les completa el correo de empresa con el personal, que es el unico
-- dato de contacto que se tenia de ellos. En una base sin empleados (el caso
-- de hoy) simplemente no afecta ninguna fila.

-- 1. Respaldo: ningun empleado puede quedarse sin correo de empresa.
UPDATE "employees"
SET "correo_empresa" = "correo_personal"
WHERE "correo_empresa" IS NULL;

-- 2. El correo de empresa pasa a ser el obligatorio.
ALTER TABLE "employees" ALTER COLUMN "correo_empresa" SET NOT NULL;

-- 3. El correo personal pasa a ser opcional.
ALTER TABLE "employees" ALTER COLUMN "correo_personal" DROP NOT NULL;

-- 4. El tipo de contrato pasa a ser opcional.
ALTER TABLE "employees" ALTER COLUMN "tipo_contrato" DROP NOT NULL;
