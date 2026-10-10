-- Lineas que cambio una solicitud de Cambio de equipo (SPEC 2.143), en pares [anterior1, nueva1,
-- anterior2, nueva2, ...] como assignment_ids: el detalle muestra cada linea con la que la reemplazo.

ALTER TABLE "workflow_requests" ADD COLUMN "linea_ids" TEXT[] NOT NULL DEFAULT '{}';
