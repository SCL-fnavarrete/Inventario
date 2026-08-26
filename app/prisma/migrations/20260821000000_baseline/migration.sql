-- Baseline de migraciones — Ola 0
--
-- Este archivo captura el estado real de la base de datos al 2026-08-21.
-- Los 18 modelos posteriores a `system_users` se habian creado con `prisma db push`,
-- por lo que no existia historial de migraciones auditable para ellos.
--
-- La migracion `20251211_init` ya crea el enum "SystemRole", la tabla "system_users"
-- y su indice unico; esos objetos estan deliberadamente ausentes aqui para que la
-- reproduccion desde cero (`prisma migrate deploy`) no falle por duplicados.
--
-- Verificacion previa: `prisma migrate diff --from-schema-datasource --to-schema-datamodel`
-- devolvio una migracion vacia => cero deriva entre Neon y prisma/schema.prisma.

-- CreateEnum
CREATE TYPE "CategoriaKit" AS ENUM ('kit_bienvenida', 'epp');

-- CreateEnum
CREATE TYPE "CondicionActivo" AS ENUM ('nuevo', 'usado', 'danado');

-- CreateEnum
CREATE TYPE "EstadoActivo" AS ENUM ('disponible', 'asignado', 'en_mantencion', 'reutilizable', 'baja', 'vendido');

-- CreateEnum
CREATE TYPE "EstadoDevolucion" AS ENUM ('ok', 'danado', 'incompleto');

-- CreateEnum
CREATE TYPE "EstadoDevolucionTipo" AS ENUM ('ok', 'danado', 'no_aplica', 'pendiente');

-- CreateEnum
CREATE TYPE "EstadoEmpleado" AS ENUM ('activo', 'desvinculado', 'licencia');

-- CreateEnum
CREATE TYPE "EstadoGuia" AS ENUM ('pendiente', 'despachado', 'recibido', 'anulado');

-- CreateEnum
CREATE TYPE "EstadoKit" AS ENUM ('entregado', 'devuelto', 'perdido');

-- CreateEnum
CREATE TYPE "EstadoMantencion" AS ENUM ('pendiente', 'en_proceso', 'completada', 'cancelada');

-- CreateEnum
CREATE TYPE "EstadoPendiente" AS ENUM ('pendiente', 'gestionando', 'entregado', 'no_aplica');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('solicitud_recibida', 'gestion_ti', 'equipos_entregados', 'registro_rrhh', 'incidencia_detectada', 'cambio_ejecutado', 'confirmacion_rrhh', 'solicitud_emitida', 'coordinacion_en_curso', 'equipo_recibido', 'consolidacion_cierre');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA_CREDITO', 'CAJA_CHICA', 'REEMBOLSO_PENDIENTE');

-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('CLP', 'USD');

-- CreateEnum
CREATE TYPE "PrioridadSolicitud" AS ENUM ('baja', 'media', 'alta', 'urgente');
-- CreateEnum
CREATE TYPE "TipoCompra" AS ENUM ('FACTURA', 'GASTO_MENOR');

-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('planta', 'proyecto', 'externo');

-- CreateEnum
CREATE TYPE "TipoDespacho" AS ENUM ('asignacion', 'traslado', 'prestamo');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('creacion', 'asignacion', 'devolucion', 'mantencion', 'cambio_estado', 'actualizacion_specs', 'baja', 'venta', 'solicitud_workflow');

-- CreateEnum
CREATE TYPE "TipoMantencion" AS ENUM ('preventiva', 'correctiva', 'actualizacion_so', 'limpieza', 'reparacion');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ingreso', 'cambio', 'reemplazo', 'temporal');

-- CreateEnum
CREATE TYPE "TipoPendiente" AS ENUM ('celular', 'audifonos', 'mochila', 'cargador', 'epp_zapatos', 'epp_chaleco', 'epp_casco', 'epp_lentes', 'kit_bienvenida', 'otro');

-- CreateEnum
CREATE TYPE "TipoSolicitud" AS ENUM ('onboarding', 'cambio_equipo', 'devolucion_termino');

-- CreateTable
CREATE TABLE "asset_categories" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "requiere_serie" BOOLEAN NOT NULL DEFAULT true,
    "requiere_imei" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_history" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "tipo_evento" "TipoEvento" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "datos_anteriores" JSONB,
    "datos_nuevos" JSONB,
    "usuario_sistema" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "categoria_id" TEXT NOT NULL,
    "numero_serie" TEXT,
    "imei" TEXT,
    "numero_activo_interno" TEXT,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "procesador" TEXT,
    "disco_duro" TEXT,
    "ram" TEXT,
    "pulgadas" DECIMAL(4,1),
    "sistema_operativo" TEXT,
    "numero_telefono" TEXT,
    "numero_activacion" TEXT,
    "tipo_plan" TEXT,
    "operador" TEXT,
    "tiene_cargador" BOOLEAN NOT NULL DEFAULT true,
    "estado" "EstadoActivo" NOT NULL DEFAULT 'disponible',
    "condicion" "CondicionActivo" NOT NULL DEFAULT 'nuevo',
    "ubicacion_fisica" TEXT,
    "microsoft_365" BOOLEAN NOT NULL DEFAULT false,
    "intune_enrolled" BOOLEAN NOT NULL DEFAULT false,
    "lista_distribucion" TEXT,
    "antivirus" TEXT,
    "incidencia" TEXT,
    "fecha_compra" TIMESTAMP(3),
    "fecha_garantia_fin" TIMESTAMP(3),
    "fecha_baja" TIMESTAMP(3),
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "empleado_actual_id" TEXT,
    "nombre_equipo" TEXT,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "fecha_entrega" TIMESTAMP(3) NOT NULL,
    "lugar_entrega" TEXT,
    "entregado_por" TEXT,
    "tipo_movimiento" "TipoMovimiento" NOT NULL,
    "motivo" TEXT,
    "fecha_devolucion" TIMESTAMP(3),
    "recibido_por" TEXT,
    "estado_devolucion" "EstadoDevolucion",
    "observaciones_devolucion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "acta_entrega_url" TEXT,
    "acta_devolucion_url" TEXT,
    "firma_empleado_entrega" TEXT,
    "firma_empleado_devolucion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_guide_items" (
    "id" TEXT NOT NULL,
    "guide_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_guide_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_guides" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "tipo_despacho" "TipoDespacho" NOT NULL,
    "despachado_por" TEXT NOT NULL,
    "fecha_despacho" TIMESTAMP(3) NOT NULL,
    "destinatario_id" TEXT,
    "destinatario_nombre" TEXT,
    "destinatario_rut" TEXT,
    "observaciones" TEXT,
    "estado" "EstadoGuia" NOT NULL DEFAULT 'pendiente',
    "fecha_recepcion" TIMESTAMP(3),
    "recibido_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_guides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "rut" TEXT,
    "nombre" TEXT NOT NULL,
    "apellido_paterno" TEXT NOT NULL,
    "apellido_materno" TEXT,
    "correo" TEXT NOT NULL,
    "cargo" TEXT,
    "jefatura" TEXT,
    "supervisor" TEXT,
    "ubicacion" TEXT,
    "tipo_contrato" "TipoContrato" NOT NULL,
    "fecha_ingreso" TIMESTAMP(3),
    "fecha_termino" TIMESTAMP(3),
    "estado" "EstadoEmpleado" NOT NULL DEFAULT 'activo',
    "telefono_contacto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "fecha_entrega_epp" TIMESTAMP(3),
    "fecha_entrega_kit" TIMESTAMP(3),
    "proxima_mantencion_epp" TIMESTAMP(3),
    "microsoft_id" TEXT,
    "origen_microsoft" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kit_assignments" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "fecha_entrega" TIMESTAMP(3) NOT NULL,
    "estado" "EstadoKit" NOT NULL DEFAULT 'entregado',
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kit_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenances" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "tipo" "TipoMantencion" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha_programada" TIMESTAMP(3),
    "fecha_realizada" TIMESTAMP(3),
    "proxima_mantencion" TIMESTAMP(3),
    "realizado_por" TEXT,
    "costo" DECIMAL(10,2),
    "proveedor_externo" TEXT,
    "estado" "EstadoMantencion" NOT NULL DEFAULT 'pendiente',
    "resultado" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_assets" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "precio_unitario" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT,
    "numero_factura" TEXT,
    "fecha_factura" TIMESTAMP(3) NOT NULL,
    "monto_total" DECIMAL(12,2),
    "moneda" "Moneda" NOT NULL DEFAULT 'CLP',
    "orden_compra" TEXT,
    "documento_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comprado_por" TEXT,
    "descripcion" TEXT,
    "metodo_pago" "MetodoPago" NOT NULL DEFAULT 'TRANSFERENCIA',
    "tipo_compra" "TipoCompra" NOT NULL DEFAULT 'FACTURA',

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "rut_empresa" TEXT,
    "razon_social" TEXT NOT NULL,
    "nombre_contacto" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "terminations" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "fecha_desvinculacion" TIMESTAMP(3) NOT NULL,
    "fecha_devolucion_equipos" TIMESTAMP(3),
    "estado_notebook" "EstadoDevolucionTipo" NOT NULL DEFAULT 'pendiente',
    "estado_celular" "EstadoDevolucionTipo" NOT NULL DEFAULT 'pendiente',
    "estado_monitor" "EstadoDevolucionTipo" NOT NULL DEFAULT 'pendiente',
    "estado_kit" "EstadoDevolucionTipo" NOT NULL DEFAULT 'pendiente',
    "numero_telefono_celular" TEXT,
    "imei_celular" TEXT,
    "recibido_por" TEXT,
    "lugar_devolucion" TEXT,
    "requiere_descuento" BOOLEAN NOT NULL DEFAULT false,
    "monto_descuento" DECIMAL(10,2),
    "motivo_descuento" TEXT,
    "notificado_rrhh" BOOLEAN NOT NULL DEFAULT false,
    "fecha_notificacion_rrhh" TIMESTAMP(3),
    "observaciones" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "welcome_kit_items" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "CategoriaKit" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "welcome_kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_comments" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "autor_id" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "es_interno" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_pendientes" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "tipo" "TipoPendiente" NOT NULL,
    "estado" "EstadoPendiente" NOT NULL DEFAULT 'pendiente',
    "descripcion" TEXT,
    "actualizado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_pendientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_requests" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "TipoSolicitud" NOT NULL,
    "estado" "EstadoSolicitud" NOT NULL,
    "prioridad" "PrioridadSolicitud" NOT NULL DEFAULT 'media',
    "employee_id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "responsable_actual_id" TEXT,
    "fecha_ingreso" TIMESTAMP(3),
    "cargo_solicitado" TEXT,
    "ubicacion_destino" TEXT,
    "requiere_notebook" BOOLEAN NOT NULL DEFAULT false,
    "requiere_celular" BOOLEAN NOT NULL DEFAULT false,
    "requiere_monitor" BOOLEAN NOT NULL DEFAULT false,
    "ticket_freshdesk" TEXT,
    "motivo_cambio" TEXT,
    "fecha_desvinculacion" TIMESTAMP(3),
    "medio_devolucion" TEXT,
    "ot_chilexpress" TEXT,
    "ciudad_devolucion" TEXT,
    "assignment_ids" TEXT[],
    "termination_id" TEXT,
    "dispatch_guide_id" TEXT,
    "observaciones" TEXT,
    "fecha_cierre" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "estado_anterior" "EstadoSolicitud" NOT NULL,
    "estado_nuevo" "EstadoSolicitud" NOT NULL,
    "ejecutado_por_id" TEXT NOT NULL,
    "comentario" TEXT,
    "datos_accion" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_categories_nombre_key" ON "asset_categories"("nombre" ASC);

-- CreateIndex
CREATE INDEX "asset_history_asset_id_idx" ON "asset_history"("asset_id" ASC);

-- CreateIndex
CREATE INDEX "asset_history_created_at_idx" ON "asset_history"("created_at" ASC);

-- CreateIndex
CREATE INDEX "asset_history_tipo_evento_idx" ON "asset_history"("tipo_evento" ASC);

-- CreateIndex
CREATE INDEX "assets_categoria_id_idx" ON "assets"("categoria_id" ASC);

-- CreateIndex
CREATE INDEX "assets_created_at_idx" ON "assets"("created_at" ASC);

-- CreateIndex
CREATE INDEX "assets_empleado_actual_id_idx" ON "assets"("empleado_actual_id" ASC);

-- CreateIndex
CREATE INDEX "assets_estado_idx" ON "assets"("estado" ASC);

-- CreateIndex
CREATE INDEX "assets_marca_idx" ON "assets"("marca" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "assets_numero_serie_key" ON "assets"("numero_serie" ASC);

-- CreateIndex
CREATE INDEX "assignments_activo_idx" ON "assignments"("activo" ASC);

-- CreateIndex
CREATE INDEX "assignments_asset_id_idx" ON "assignments"("asset_id" ASC);

-- CreateIndex
CREATE INDEX "assignments_employee_id_idx" ON "assignments"("employee_id" ASC);

-- CreateIndex
CREATE INDEX "assignments_fecha_entrega_idx" ON "assignments"("fecha_entrega" ASC);

-- CreateIndex
CREATE INDEX "assignments_tipo_movimiento_idx" ON "assignments"("tipo_movimiento" ASC);

-- CreateIndex
CREATE INDEX "dispatch_guide_items_asset_id_idx" ON "dispatch_guide_items"("asset_id" ASC);

-- CreateIndex
CREATE INDEX "dispatch_guide_items_guide_id_idx" ON "dispatch_guide_items"("guide_id" ASC);

-- CreateIndex
CREATE INDEX "dispatch_guides_destinatario_id_idx" ON "dispatch_guides"("destinatario_id" ASC);

-- CreateIndex
CREATE INDEX "dispatch_guides_estado_idx" ON "dispatch_guides"("estado" ASC);

-- CreateIndex
CREATE INDEX "dispatch_guides_fecha_despacho_idx" ON "dispatch_guides"("fecha_despacho" ASC);

-- CreateIndex
CREATE INDEX "dispatch_guides_numero_idx" ON "dispatch_guides"("numero" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_guides_numero_key" ON "dispatch_guides"("numero" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employees_correo_key" ON "employees"("correo" ASC);

-- CreateIndex
CREATE INDEX "employees_created_at_idx" ON "employees"("created_at" ASC);

-- CreateIndex
CREATE INDEX "employees_estado_idx" ON "employees"("estado" ASC);

-- CreateIndex
CREATE INDEX "employees_jefatura_idx" ON "employees"("jefatura" ASC);

-- CreateIndex
CREATE INDEX "employees_microsoft_id_idx" ON "employees"("microsoft_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employees_microsoft_id_key" ON "employees"("microsoft_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "employees_rut_key" ON "employees"("rut" ASC);

-- CreateIndex
CREATE INDEX "employees_tipo_contrato_idx" ON "employees"("tipo_contrato" ASC);

-- CreateIndex
CREATE INDEX "employees_ubicacion_idx" ON "employees"("ubicacion" ASC);

-- CreateIndex
CREATE INDEX "maintenances_asset_id_idx" ON "maintenances"("asset_id" ASC);

-- CreateIndex
CREATE INDEX "maintenances_estado_idx" ON "maintenances"("estado" ASC);

-- CreateIndex
CREATE INDEX "maintenances_fecha_programada_idx" ON "maintenances"("fecha_programada" ASC);

-- CreateIndex
CREATE INDEX "maintenances_tipo_idx" ON "maintenances"("tipo" ASC);

-- CreateIndex
CREATE INDEX "terminations_employee_id_idx" ON "terminations"("employee_id" ASC);

-- CreateIndex
CREATE INDEX "terminations_fecha_desvinculacion_idx" ON "terminations"("fecha_desvinculacion" ASC);

-- CreateIndex
CREATE INDEX "terminations_notificado_rrhh_idx" ON "terminations"("notificado_rrhh" ASC);

-- CreateIndex
CREATE INDEX "workflow_comments_autor_id_idx" ON "workflow_comments"("autor_id" ASC);

-- CreateIndex
CREATE INDEX "workflow_comments_request_id_idx" ON "workflow_comments"("request_id" ASC);

-- CreateIndex
CREATE INDEX "workflow_pendientes_estado_idx" ON "workflow_pendientes"("estado" ASC);

-- CreateIndex
CREATE INDEX "workflow_pendientes_request_id_idx" ON "workflow_pendientes"("request_id" ASC);

-- CreateIndex
CREATE INDEX "workflow_requests_created_at_idx" ON "workflow_requests"("created_at" ASC);

-- CreateIndex
CREATE INDEX "workflow_requests_employee_id_idx" ON "workflow_requests"("employee_id" ASC);

-- CreateIndex
CREATE INDEX "workflow_requests_estado_idx" ON "workflow_requests"("estado" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_requests_numero_key" ON "workflow_requests"("numero" ASC);

-- CreateIndex
CREATE INDEX "workflow_requests_responsable_actual_id_idx" ON "workflow_requests"("responsable_actual_id" ASC);

-- CreateIndex
CREATE INDEX "workflow_requests_solicitante_id_idx" ON "workflow_requests"("solicitante_id" ASC);

-- CreateIndex
CREATE INDEX "workflow_requests_tipo_idx" ON "workflow_requests"("tipo" ASC);

-- CreateIndex
CREATE INDEX "workflow_transitions_created_at_idx" ON "workflow_transitions"("created_at" ASC);

-- CreateIndex
CREATE INDEX "workflow_transitions_request_id_idx" ON "workflow_transitions"("request_id" ASC);

-- AddForeignKey
ALTER TABLE "asset_history" ADD CONSTRAINT "asset_history_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "asset_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_empleado_actual_id_fkey" FOREIGN KEY ("empleado_actual_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guide_items" ADD CONSTRAINT "dispatch_guide_items_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guide_items" ADD CONSTRAINT "dispatch_guide_items_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "dispatch_guides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_assignments" ADD CONSTRAINT "kit_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_assignments" ADD CONSTRAINT "kit_assignments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "welcome_kit_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenances" ADD CONSTRAINT "maintenances_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_assets" ADD CONSTRAINT "purchase_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_assets" ADD CONSTRAINT "purchase_assets_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminations" ADD CONSTRAINT "terminations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_comments" ADD CONSTRAINT "workflow_comments_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_comments" ADD CONSTRAINT "workflow_comments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_pendientes" ADD CONSTRAINT "workflow_pendientes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_requests" ADD CONSTRAINT "workflow_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_requests" ADD CONSTRAINT "workflow_requests_responsable_actual_id_fkey" FOREIGN KEY ("responsable_actual_id") REFERENCES "system_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_requests" ADD CONSTRAINT "workflow_requests_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_ejecutado_por_id_fkey" FOREIGN KEY ("ejecutado_por_id") REFERENCES "system_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

