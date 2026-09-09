-- Onboarding suma una etapa "Coordinando Entrega" entre Gestion TI y Equipos
-- Entregados: despues de asignar los equipos en el sistema, el tecnico
-- coordina la entrega real (fecha/hora y si es presencial -- donde -- o por
-- despacho Chilexpress -- con que OT). Simetrico a los campos que offboarding
-- ya usa para la devolucion (medioDevolucion/otChilexpress), pero en la otra
-- direccion.

ALTER TYPE "EstadoSolicitud" ADD VALUE 'coordinando_entrega';

ALTER TABLE "workflow_requests" ADD COLUMN "fecha_entrega_coordinada" TIMESTAMP(3);
ALTER TABLE "workflow_requests" ADD COLUMN "medio_entrega" TEXT;
ALTER TABLE "workflow_requests" ADD COLUMN "lugar_entrega" TEXT;
ALTER TABLE "workflow_requests" ADD COLUMN "ot_chilexpress_entrega" TEXT;
