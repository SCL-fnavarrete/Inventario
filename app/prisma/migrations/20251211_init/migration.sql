-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('admin', 'tecnico', 'supervisor', 'rrhh', 'auditor');

-- CreateTable
CREATE TABLE "system_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "SystemRole" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_users_email_key" ON "system_users"("email");

