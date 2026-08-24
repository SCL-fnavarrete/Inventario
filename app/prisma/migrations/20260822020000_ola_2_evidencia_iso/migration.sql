-- Ola 2 — evidencia ISO: categorías estables, historial, documentos y notificaciones.
-- La columna de categorías se agrega nullable, se clasifica de forma conservadora
-- por nombre normalizado y solo entonces se endurece al contrato final.

-- CreateEnum
CREATE TYPE "TipoDevolucion" AS ENUM ('notebook', 'celular', 'monitor', 'kit', 'otro');

-- CreateEnum
CREATE TYPE "TipoEventoEmpleado" AS ENUM ('creacion', 'actualizacion', 'sync_microsoft', 'cambio_estado', 'desvinculacion', 'reactivacion');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('anexo_entrega', 'comprobante_entrega', 'comprobante_cambio', 'acta_devolucion');

-- CreateEnum
CREATE TYPE "EstadoArchivoDocumento" AS ENUM ('pendiente', 'archivado', 'fallido');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('cierre_onboarding', 'cierre_desvinculacion', 'alerta_equipos_pendientes');

-- CreateEnum
-- `enviando` se reclama antes de llamar a Graph: sin ese estado dos intentos
-- concurrentes pasan los dos por `sendMail`, y separa "nunca se intento" de
-- "se intento y no sabemos si salio".
CREATE TYPE "EstadoNotificacion" AS ENUM ('pendiente', 'enviando', 'enviada', 'fallida');

-- AlterTable
ALTER TABLE "asset_categories" ADD COLUMN "tipo_devolucion" "TipoDevolucion";

-- Solo se clasifican equivalencias exactas tras normalizar espacios, guiones y
-- puntuación. No se infieren categorías por coincidencias parciales; todo lo
-- demás queda en `otro` y `kit` se reserva para KitAssignment.
UPDATE "asset_categories"
SET "tipo_devolucion" = CASE regexp_replace(lower(trim("nombre")), '[^[:alnum:]]', '', 'g')
    WHEN 'notebook' THEN 'notebook'::"TipoDevolucion"
    WHEN 'celular' THEN 'celular'::"TipoDevolucion"
    WHEN 'monitor' THEN 'monitor'::"TipoDevolucion"
    ELSE 'otro'::"TipoDevolucion"
END;

ALTER TABLE "asset_categories"
  ALTER COLUMN "tipo_devolucion" SET DEFAULT 'otro'::"TipoDevolucion",
  ALTER COLUMN "tipo_devolucion" SET NOT NULL;

-- AlterTable
-- El cierre de una desvinculacion pregunta por los equipos cuya categoria no
-- evalua una por una, en vez de bloquearse: la mayoria de las categorias caen en
-- `otro`, asi que el bloqueo alcanzaba al caso dominante.
ALTER TABLE "terminations"
  ADD COLUMN "estado_otros" "EstadoDevolucionTipo" NOT NULL DEFAULT 'pendiente';

-- AlterTable
ALTER TABLE "assignments"
  ADD COLUMN "firma_empleado_entrega_en" TIMESTAMP(3),
  ADD COLUMN "firma_empleado_devolucion_en" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "employee_history" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "tipo_evento" "TipoEventoEmpleado" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "datos_anteriores" JSONB,
    "datos_nuevos" JSONB,
    "usuario_sistema" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_emitidos" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "contenido_snapshot" JSONB NOT NULL,
    -- Los bytes exactos del PDF emitido: el archivo en SharePoint y el hash se
    -- derivan de aqui. Sin ellos, archivar exige re-renderizar con el codigo
    -- del dia del reintento y cualquier cambio de plantilla vuelve el documento
    -- irrecuperable.
    "contenido_pdf" BYTEA NOT NULL,
    "hash_sha256" TEXT NOT NULL,
    "sharepoint_item_id" TEXT,
    "sharepoint_url" TEXT,
    "archivo_estado" "EstadoArchivoDocumento" NOT NULL DEFAULT 'pendiente',
    "archivo_error" TEXT,
    "intentos_archivo" INTEGER NOT NULL DEFAULT 0,
    "emitido_por" TEXT NOT NULL,
    "emitido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firma_empleado" TEXT,
    "firma_empleado_en" TIMESTAMP(3),
    "motivo_reemision" TEXT,
    "employee_id" TEXT NOT NULL,
    "request_id" TEXT,
    "assignment_id" TEXT,
    "termination_id" TEXT,

    CONSTRAINT "documentos_emitidos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones_enviadas" (
    "id" TEXT NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "destinatarios" TEXT[],
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "documento_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estado" "EstadoNotificacion" NOT NULL DEFAULT 'pendiente',
    "mensaje_error" TEXT,
    "enviada_por" TEXT NOT NULL,
    "aceptada_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" TEXT,
    "termination_id" TEXT,

    CONSTRAINT "notificaciones_enviadas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notificaciones_enviadas_destinatarios_not_null_check" CHECK ("destinatarios" IS NOT NULL),
    CONSTRAINT "notificaciones_enviadas_documento_ids_not_null_check" CHECK ("documento_ids" IS NOT NULL)
);

-- CreateIndex
CREATE INDEX "asset_categories_tipo_devolucion_idx" ON "asset_categories"("tipo_devolucion");

-- CreateIndex
CREATE INDEX "employee_history_employee_id_created_at_idx" ON "employee_history"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "employee_history_employee_id_tipo_evento_created_at_idx" ON "employee_history"("employee_id", "tipo_evento", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_emitidos_numero_version_key" ON "documentos_emitidos"("numero", "version");

-- CreateIndex
CREATE INDEX "documentos_emitidos_employee_id_emitido_en_idx" ON "documentos_emitidos"("employee_id", "emitido_en");

-- CreateIndex
CREATE INDEX "documentos_emitidos_archivo_estado_emitido_en_idx" ON "documentos_emitidos"("archivo_estado", "emitido_en");

-- CreateIndex
CREATE INDEX "documentos_emitidos_request_id_idx" ON "documentos_emitidos"("request_id");

-- CreateIndex
CREATE INDEX "documentos_emitidos_assignment_id_idx" ON "documentos_emitidos"("assignment_id");

-- CreateIndex
CREATE INDEX "documentos_emitidos_termination_id_idx" ON "documentos_emitidos"("termination_id");

-- CreateIndex
CREATE INDEX "notificaciones_enviadas_estado_created_at_idx" ON "notificaciones_enviadas"("estado", "created_at");

-- CreateIndex
CREATE INDEX "notificaciones_enviadas_tipo_created_at_idx" ON "notificaciones_enviadas"("tipo", "created_at");

-- CreateIndex
CREATE INDEX "notificaciones_enviadas_request_id_idx" ON "notificaciones_enviadas"("request_id");

-- CreateIndex
CREATE INDEX "notificaciones_enviadas_termination_id_idx" ON "notificaciones_enviadas"("termination_id");

-- AddForeignKey
ALTER TABLE "employee_history" ADD CONSTRAINT "employee_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_emitidos" ADD CONSTRAINT "documentos_emitidos_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_emitidos" ADD CONSTRAINT "documentos_emitidos_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_emitidos" ADD CONSTRAINT "documentos_emitidos_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_emitidos" ADD CONSTRAINT "documentos_emitidos_termination_id_fkey" FOREIGN KEY ("termination_id") REFERENCES "terminations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones_enviadas" ADD CONSTRAINT "notificaciones_enviadas_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones_enviadas" ADD CONSTRAINT "notificaciones_enviadas_termination_id_fkey" FOREIGN KEY ("termination_id") REFERENCES "terminations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los documentos emitidos son evidencia física: no se borran ni se alteran los
-- datos que definen la emisión. Solo se permite actualizar el estado staged de
-- archivo (SharePoint, estado, error e intentos). Los contextos pueden pasar de
-- un valor a NULL, y solamente en esa dirección, para que los FKs ON DELETE SET
-- NULL conserven el documento cuando se borra un registro operativo.
CREATE OR REPLACE FUNCTION "proteger_documentos_emitidos"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Los triggers de FILA no se disparan nunca en TRUNCATE, y `ON DELETE
    -- RESTRICT` tampoco lo detiene: sin esta rama, un `TRUNCATE
    -- documentos_emitidos` —o un `TRUNCATE employees CASCADE` desde un script
    -- de limpieza apuntado a la base equivocada— borra la evidencia completa
    -- sin error ni traza, mientras el DELETE bloqueado da la falsa sensacion de
    -- que eso no puede pasar. La declaracion del trigger de STATEMENT que
    -- alcanza este camino esta al final del archivo.
    IF TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'No se permite truncar documentos emitidos';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'No se permite eliminar documentos emitidos';
    END IF;

    IF OLD.id IS DISTINCT FROM NEW.id
       OR OLD.numero IS DISTINCT FROM NEW.numero
       OR OLD.tipo IS DISTINCT FROM NEW.tipo
       OR OLD.version IS DISTINCT FROM NEW.version
       OR OLD.contenido_snapshot IS DISTINCT FROM NEW.contenido_snapshot
       OR OLD.contenido_pdf IS DISTINCT FROM NEW.contenido_pdf
       OR OLD.hash_sha256 IS DISTINCT FROM NEW.hash_sha256
       OR OLD.emitido_por IS DISTINCT FROM NEW.emitido_por
       OR OLD.emitido_en IS DISTINCT FROM NEW.emitido_en
       OR OLD.firma_empleado IS DISTINCT FROM NEW.firma_empleado
       OR OLD.firma_empleado_en IS DISTINCT FROM NEW.firma_empleado_en
       OR OLD.motivo_reemision IS DISTINCT FROM NEW.motivo_reemision
       OR OLD.employee_id IS DISTINCT FROM NEW.employee_id THEN
        RAISE EXCEPTION 'No se permite modificar la evidencia de un documento emitido';
    END IF;

    IF (NEW.request_id IS NOT NULL AND NEW.request_id IS DISTINCT FROM OLD.request_id)
       OR (NEW.assignment_id IS NOT NULL AND NEW.assignment_id IS DISTINCT FROM OLD.assignment_id)
       OR (NEW.termination_id IS NOT NULL AND NEW.termination_id IS DISTINCT FROM OLD.termination_id) THEN
        RAISE EXCEPTION 'Los contextos de un documento emitido solo pueden conservarse o quedar en NULL';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "documentos_emitidos_proteger_inmutabilidad"
BEFORE UPDATE OR DELETE ON "documentos_emitidos"
FOR EACH ROW EXECUTE FUNCTION "proteger_documentos_emitidos"();

-- TRUNCATE necesita su propio trigger, de STATEMENT: el de fila de arriba no lo
-- ve. Comparten la funcion, que distingue el caso por TG_OP.
CREATE TRIGGER "documentos_emitidos_proteger_truncate"
BEFORE TRUNCATE ON "documentos_emitidos"
FOR EACH STATEMENT EXECUTE FUNCTION "proteger_documentos_emitidos"();
