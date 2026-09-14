-- Auditoria generica de escritura (SPEC 2.29, 14-sep-2026): cubre
-- Empleado/Compra/Usuario -- los 3 modulos que hoy solo dejan "updated_at"
-- en la fila, sin quien ni que cambio. Se agrega porque desde SPEC 2.29 un
-- tecnico puede crear/editar/eliminar datos de CUALQUIER sede, y Javier
-- condiciono abrir ese acceso a que "cualquier cosa quede un registro"
-- ligado al usuario que la ejecuto. Proveedores queda excluido a proposito.

-- CreateEnum
CREATE TYPE "AuditEntidad" AS ENUM ('empleado', 'compra', 'usuario');

-- CreateEnum
CREATE TYPE "AuditAccion" AS ENUM ('crear', 'actualizar', 'eliminar');

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "entidad" "AuditEntidad" NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "accion" "AuditAccion" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "datos_anteriores" JSONB,
    "datos_nuevos" JSONB,
    "usuario_sistema" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_entidad_entidad_id_idx" ON "audit_log"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");
