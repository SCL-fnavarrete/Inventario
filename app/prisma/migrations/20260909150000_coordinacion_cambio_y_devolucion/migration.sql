-- Agrega la etapa de coordinacion a cambio_equipo y offboarding, ANTES de
-- ejecutar el cambio / recibir los equipos: presencial (fecha/hora + lugar)
-- u OT de despacho (numero de OT + ciudad destino + fecha estimada de
-- llegada). Ver SPEC 2.5.2 regla 9 (v1.5).
--
-- 'coordinando_cambio' es un valor nuevo del enum. 'coordinacion_en_curso'
-- ya existia (agregado sin usar en una migracion anterior) -- esta vez se
-- conecta a TRANSITIONS/STATES_BY_TYPE como la etapa de coordinacion del
-- offboarding.
ALTER TYPE "EstadoSolicitud" ADD VALUE 'coordinando_cambio';

-- Coordinacion de cambio (cambio_equipo)
-- Nota: la tabla real es "workflow_requests" (@@map del modelo
-- WorkflowRequest) -- usar el nombre del modelo aca rompia el shadow
-- database de `prisma migrate dev` con P3006/P1014 ("underlying table for
-- model WorkflowRequest does not exist"), porque esa tabla nunca existio
-- con ese nombre en Postgres.
ALTER TABLE "workflow_requests" ADD COLUMN "medio_cambio" TEXT;
ALTER TABLE "workflow_requests" ADD COLUMN "fecha_cambio_coordinada" TIMESTAMP(3);
ALTER TABLE "workflow_requests" ADD COLUMN "lugar_cambio" TEXT;
ALTER TABLE "workflow_requests" ADD COLUMN "ot_cambio_chilexpress" TEXT;
ALTER TABLE "workflow_requests" ADD COLUMN "ciudad_cambio" TEXT;

-- Coordinacion de devolucion (offboarding). medio_devolucion, ot_chilexpress
-- y ciudad_devolucion ya existian (se podian llenar al crear el ticket);
-- fecha_devolucion_coordinada y lugar_devolucion son nuevos.
ALTER TABLE "workflow_requests" ADD COLUMN "fecha_devolucion_coordinada" TIMESTAMP(3);
ALTER TABLE "workflow_requests" ADD COLUMN "lugar_devolucion" TEXT;
