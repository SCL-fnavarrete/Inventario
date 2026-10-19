-- SPEC 2.170: las sedes no se desactivan (se eliminan si nada las usa) y no
-- hay bloqueo por equipo (basta el bloqueo de cada cuenta). Una sede que
-- estuviera desactivada queda como cualquier otra.

-- AlterTable
ALTER TABLE "sedes" DROP COLUMN "activa";

-- AlterTable
ALTER TABLE "system_config" DROP COLUMN "max_intentos_ip",
DROP COLUMN "minutos_bloqueo_ip";
