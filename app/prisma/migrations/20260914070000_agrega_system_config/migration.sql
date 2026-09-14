-- Configuracion general del sistema (14-sep-2026): reemplaza la pantalla
-- decorativa de Configuracion > Parametros Generales (datos de ejemplo
-- hardcodeados, el boton Guardar solo simulaba un delay) por una tabla real
-- de fila unica. Ver SystemConfig en schema.prisma para el detalle de cada
-- campo.

-- AlterEnum
ALTER TYPE "AuditEntidad" ADD VALUE 'configuracion';

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "empresa_nombre" TEXT,
    "empresa_rut" TEXT,
    "empresa_direccion" TEXT,
    "empresa_telefono" TEXT,
    "empresa_email" TEXT,
    "empresa_sitio_web" TEXT,
    "duracion_sesion_horas" INTEGER NOT NULL DEFAULT 24,
    "max_intentos_login" INTEGER NOT NULL DEFAULT 5,
    "minutos_bloqueo_login" INTEGER NOT NULL DEFAULT 15,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_por" TEXT,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);
