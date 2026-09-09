-- Igual que assignment_ids en workflow_requests, pero para las devoluciones
-- de EPP (kit_assignments) hechas durante el offboarding. Se necesita para
-- poder mostrar en el detalle del ticket que EPP se devolvio (con estado y
-- observaciones) sin traer todo el historico de kit del empleado.

ALTER TABLE "workflow_requests" ADD COLUMN "kit_return_ids" TEXT[] NOT NULL DEFAULT '{}';
