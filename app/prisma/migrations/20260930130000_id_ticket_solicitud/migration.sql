-- SPEC 2.123: ticket de la ticketera asociado a cada solicitud. Opcional en
-- la base porque las solicitudes anteriores no lo tienen; obligatorio al crear.
ALTER TABLE "workflow_requests" ADD COLUMN "id_ticket" TEXT;
