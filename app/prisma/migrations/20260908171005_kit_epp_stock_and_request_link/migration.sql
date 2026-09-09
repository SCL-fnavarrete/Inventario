-- Kit de Bienvenida y EPP dejan de ser categorias de Activos (que es para
-- equipos) y pasan a manejarse en su propia tabla, welcome_kit_items, que
-- ya existia en el esquema pero no se usaba. Se le agrega stock (cantidad)
-- y a kit_assignments se le agrega el vinculo con la solicitud que origino
-- la entrega y cuantas unidades se entregaron.

ALTER TABLE "welcome_kit_items" ADD COLUMN "cantidad" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "kit_assignments" ADD COLUMN "request_id" TEXT;
ALTER TABLE "kit_assignments" ADD COLUMN "cantidad" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "kit_assignments" ADD CONSTRAINT "kit_assignments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "workflow_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "kit_assignments_request_id_idx" ON "kit_assignments"("request_id");

ALTER TABLE "workflow_requests" ADD COLUMN "kit_bienvenida_solicitado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "workflow_requests" ADD COLUMN "epp_solicitado" BOOLEAN NOT NULL DEFAULT false;
