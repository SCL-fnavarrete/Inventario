-- Normalizacion (SPEC 2.168): la solicitud guardaba el id de una guia de despacho
-- sin llave foranea, y ningun proceso lo escribia ni lo leia. Se quita.
-- Por precaucion, si alguna fila tiene un valor la migracion se detiene en vez de perderlo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "workflow_requests" WHERE "dispatch_guide_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'workflow_requests.dispatch_guide_id tiene datos: revisar antes de quitar la columna';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "workflow_requests" DROP COLUMN "dispatch_guide_id";
