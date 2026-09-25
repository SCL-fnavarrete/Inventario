-- AlterTable
ALTER TABLE "access_logs" ADD COLUMN     "sesion_id" TEXT;

-- AlterTable
ALTER TABLE "system_users" ADD COLUMN     "sesiones_desde" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "sesiones_cerradas" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesiones_cerradas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sesiones_cerradas_usuario_id_idx" ON "sesiones_cerradas"("usuario_id");

-- CreateIndex
CREATE INDEX "sesiones_cerradas_expira_en_idx" ON "sesiones_cerradas"("expira_en");

-- CreateIndex
CREATE INDEX "access_logs_sesion_id_idx" ON "access_logs"("sesion_id");

-- AddForeignKey
ALTER TABLE "sesiones_cerradas" ADD CONSTRAINT "sesiones_cerradas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "system_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

