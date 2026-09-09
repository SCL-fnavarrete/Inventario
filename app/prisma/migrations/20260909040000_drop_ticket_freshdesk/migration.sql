-- Se quita el campo "Ticket Freshdesk" de Cambio de Equipo: no se estaba
-- usando para nada mas que texto libre (no hay integracion real con
-- Freshdesk), y el motivo del cambio ya se registra en motivoCambio.
ALTER TABLE "workflow_requests" DROP COLUMN "ticket_freshdesk";
