-- La prioridad de las solicitudes no se usa en ninguna parte del sistema (ni
-- se muestra en pantalla, ni se filtra, ni el formulario de creacion la
-- pide -- siempre quedaba en su valor por defecto "media"). Se elimina el
-- campo y el enum por completo.

ALTER TABLE "workflow_requests" DROP COLUMN "prioridad";
DROP TYPE "PrioridadSolicitud";
