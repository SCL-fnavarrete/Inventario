-- Fusiona la coordinacion de fecha/medio/lugar con el paso en que se asigna
-- el equipo, en los tres flujos de Solicitudes (15-sep-2026, SPEC 2.42).
--
-- Pedido de Javier: "el tema de coordinar fecha... dejarlo para definirlo al
-- inicio tambien cuando se asigna el equipo, para asi hacemos todo de una en
-- vez de varios pasos". Se elimina la etapa intermedia de "coordinar" como
-- paso propio del workflow en los tres tipos de solicitud:
--   - Onboarding:     gestion_ti -> coordinando_entrega -> equipos_entregados
--                  => gestion_ti -> equipos_entregados
--   - Cambio equipo:  incidencia_detectada -> coordinando_cambio -> cambio_ejecutado
--                  => incidencia_detectada -> cambio_ejecutado
--   - Desvinculacion: solicitud_emitida -> coordinacion_en_curso -> equipo_recibido
--                  => solicitud_emitida -> equipo_recibido
-- La fecha/medio/lugar se siguen guardando en los mismos campos de
-- WorkflowRequest; solo cambia en que transicion se piden (junto con la
-- seleccion/ejecucion del equipo, no como paso aparte).
--
-- Postgres no permite quitar un valor de un enum con ALTER TYPE, asi que hay
-- que recrear el tipo. El enum EstadoSolicitud lo usan dos tablas: el estado
-- actual de la solicitud (workflow_requests.estado) y el historial de
-- transiciones (workflow_transitions.estado_anterior/estado_nuevo).

-- 1. Las solicitudes que estaban EN una de las tres etapas eliminadas
--    retroceden al estado anterior (el que ahora asume tambien la
--    coordinacion). No se pierde el ticket: solo vuelve a mostrar el paso
--    fusionado para completarlo de una vez. Con datos de prueba nada mas,
--    esto no deberia afectar tickets reales.
UPDATE "workflow_requests" SET "estado" = 'gestion_ti' WHERE "estado" = 'coordinando_entrega';
UPDATE "workflow_requests" SET "estado" = 'incidencia_detectada' WHERE "estado" = 'coordinando_cambio';
UPDATE "workflow_requests" SET "estado" = 'solicitud_emitida' WHERE "estado" = 'coordinacion_en_curso';

-- 2. El historial de transiciones conserva los estados eliminados tal cual
--    quedaron registrados en su momento (es un registro de auditoria, no se
--    reescribe el pasado) -- pero igual hay que migrar la COLUMNA a un enum
--    que ya no los tiene. Se mapean al mismo valor usado arriba, unicamente
--    para que la conversion de tipo no falle; el texto de la transicion
--    (comentario/datosAccion) sigue intacto y sigue diciendo lo que paso.
UPDATE "workflow_transitions" SET "estado_anterior" = 'gestion_ti' WHERE "estado_anterior" = 'coordinando_entrega';
UPDATE "workflow_transitions" SET "estado_nuevo" = 'gestion_ti' WHERE "estado_nuevo" = 'coordinando_entrega';
UPDATE "workflow_transitions" SET "estado_anterior" = 'incidencia_detectada' WHERE "estado_anterior" = 'coordinando_cambio';
UPDATE "workflow_transitions" SET "estado_nuevo" = 'incidencia_detectada' WHERE "estado_nuevo" = 'coordinando_cambio';
UPDATE "workflow_transitions" SET "estado_anterior" = 'solicitud_emitida' WHERE "estado_anterior" = 'coordinacion_en_curso';
UPDATE "workflow_transitions" SET "estado_nuevo" = 'solicitud_emitida' WHERE "estado_nuevo" = 'coordinacion_en_curso';

-- 3. Recrear el enum sin las tres etapas fusionadas.
CREATE TYPE "EstadoSolicitud_new" AS ENUM (
  'solicitud_recibida',
  'gestion_ti',
  'equipos_entregados',
  'registro_rrhh',
  'incidencia_detectada',
  'cambio_ejecutado',
  'confirmacion_rrhh',
  'solicitud_emitida',
  'equipo_recibido',
  'consolidacion_cierre',
  'cancelada'
);

ALTER TABLE "workflow_requests"
  ALTER COLUMN "estado" TYPE "EstadoSolicitud_new"
  USING ("estado"::text::"EstadoSolicitud_new");

ALTER TABLE "workflow_transitions"
  ALTER COLUMN "estado_anterior" TYPE "EstadoSolicitud_new"
  USING ("estado_anterior"::text::"EstadoSolicitud_new");

ALTER TABLE "workflow_transitions"
  ALTER COLUMN "estado_nuevo" TYPE "EstadoSolicitud_new"
  USING ("estado_nuevo"::text::"EstadoSolicitud_new");

DROP TYPE "EstadoSolicitud";

ALTER TYPE "EstadoSolicitud_new" RENAME TO "EstadoSolicitud";
