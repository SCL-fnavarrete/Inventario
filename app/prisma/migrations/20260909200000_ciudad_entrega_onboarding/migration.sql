-- Simetrico a ciudad_cambio / ciudad_devolucion: cuando la coordinacion de
-- entrega de onboarding es por despacho (Chilexpress) en vez de presencial,
-- hace falta la ciudad/ubicacion de destino, no solo el numero de OT.
-- Tabla real "workflow_requests" (@@map del modelo WorkflowRequest).
ALTER TABLE "workflow_requests" ADD COLUMN "ciudad_entrega" TEXT;
