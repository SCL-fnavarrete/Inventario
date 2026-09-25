-- Registro de accesos (SPEC 2.112): intentos de inicio de sesion, cierres y sesiones cortadas.

-- CreateEnum
CREATE TYPE "ResultadoAcceso" AS ENUM ('exito', 'clave_incorrecta', 'usuario_inexistente', 'usuario_inactivo', 'bloqueado', 'cierre_sesion', 'sesion_revocada');

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "usuario_id" TEXT,
    "resultado" "ResultadoAcceso" NOT NULL,
    "ip" TEXT,
    "navegador" TEXT,
    "detalle" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_logs_email_created_at_idx" ON "access_logs"("email", "created_at");

-- CreateIndex
CREATE INDEX "access_logs_created_at_idx" ON "access_logs"("created_at");

-- CreateIndex
CREATE INDEX "access_logs_resultado_idx" ON "access_logs"("resultado");

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "system_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

