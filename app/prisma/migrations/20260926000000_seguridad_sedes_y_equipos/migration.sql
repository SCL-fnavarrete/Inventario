-- AlterEnum
ALTER TYPE "ResultadoAcceso" ADD VALUE 'sede_inactiva';

-- AlterTable
ALTER TABLE "system_config" ADD COLUMN     "max_intentos_ip" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "minutos_bloqueo_ip" INTEGER NOT NULL DEFAULT 15;

-- CreateIndex
CREATE INDEX "access_logs_ip_created_at_idx" ON "access_logs"("ip", "created_at");

