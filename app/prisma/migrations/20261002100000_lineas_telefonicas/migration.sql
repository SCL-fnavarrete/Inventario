-- Lineas telefonicas (SPEC 2.131): el numero y el plan dejan el celular y
-- pasan a su propia tabla, asociada al celular y a quien lo tiene.

-- CreateEnum
CREATE TYPE "EstadoLinea" AS ENUM ('activa', 'baja');

-- AlterEnum
ALTER TYPE "AuditEntidad" ADD VALUE 'linea';

-- CreateTable
CREATE TABLE "lineas_telefonicas" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "plan" TEXT,
    "precio_mensual" INTEGER,
    "estado" "EstadoLinea" NOT NULL DEFAULT 'activa',
    "fecha_baja" TIMESTAMP(3),
    "activo_id" TEXT,
    "empleado_id" TEXT,
    "responsable" TEXT,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lineas_telefonicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lineas_telefonicas_numero_key" ON "lineas_telefonicas"("numero");
CREATE INDEX "lineas_telefonicas_estado_idx" ON "lineas_telefonicas"("estado");
CREATE INDEX "lineas_telefonicas_activo_id_idx" ON "lineas_telefonicas"("activo_id");
CREATE INDEX "lineas_telefonicas_empleado_id_idx" ON "lineas_telefonicas"("empleado_id");

-- AddForeignKey
ALTER TABLE "lineas_telefonicas" ADD CONSTRAINT "lineas_telefonicas_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lineas_telefonicas" ADD CONSTRAINT "lineas_telefonicas_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los numeros que ya tenian los celulares pasan a lineas: solo digitos, con
-- 56 delante si venian con 9; si dos celulares tenian el mismo, queda uno.
INSERT INTO "lineas_telefonicas" ("id", "numero", "plan", "activo_id", "empleado_id", "updated_at")
SELECT DISTINCT ON (numero) gen_random_uuid()::text, numero, plan, id, empleado_actual_id, CURRENT_TIMESTAMP
FROM (
  SELECT id, empleado_actual_id, NULLIF(trim(tipo_plan), '') AS plan, created_at,
         CASE WHEN length(d) = 9 THEN '56' || d ELSE d END AS numero
  FROM (SELECT *, regexp_replace(numero_telefono, '\D', '', 'g') AS d FROM "assets") a
  WHERE d <> ''
) n
ORDER BY numero, created_at;

-- AlterTable
ALTER TABLE "assets" DROP COLUMN "numero_telefono",
DROP COLUMN "tipo_plan";
