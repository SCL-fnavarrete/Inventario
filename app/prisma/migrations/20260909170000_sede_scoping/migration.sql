-- Aislamiento de datos por sede: cada registro operativo queda ligado a la
-- sede de quien lo creo, y el listado se filtra por eso salvo para admin.
-- Ver SPEC 2.9.

-- 1. Columnas nuevas.
ALTER TABLE "system_users" ADD COLUMN "sede_id" TEXT;
ALTER TABLE "employees" ADD COLUMN "sede_id" TEXT;
ALTER TABLE "workflow_requests" ADD COLUMN "sede_id" TEXT;
ALTER TABLE "dispatch_guides" ADD COLUMN "sede_id" TEXT;

-- 2. Backfill: los registros existentes no tienen forma de saber de que
-- sede son realmente, asi que se asignan todos a Santiago (primera sede
-- creada en la migracion anterior) para que sigan siendo visibles para
-- soporte. El admin puede reasignarlos despues desde cada modulo.
UPDATE "system_users" SET "sede_id" = (SELECT "id" FROM "sedes" WHERE "codigo" = 'STGO')
WHERE "rol" <> 'admin';

UPDATE "employees" SET "sede_id" = (SELECT "id" FROM "sedes" WHERE "codigo" = 'STGO')
WHERE "sede_id" IS NULL;

UPDATE "workflow_requests" SET "sede_id" = (SELECT "id" FROM "sedes" WHERE "codigo" = 'STGO')
WHERE "sede_id" IS NULL;

UPDATE "dispatch_guides" SET "sede_id" = (SELECT "id" FROM "sedes" WHERE "codigo" = 'STGO')
WHERE "sede_id" IS NULL;

-- Nota: "assets"."sede_id" ya existia (migracion 20260909160000) y NO se
-- backfillea aca a proposito -- un activo sin sede fisica conocida se deja
-- en null; se completa via guia de despacho tipo traslado o editandolo.

-- 3. Indices y llaves foraneas.
CREATE INDEX "system_users_sede_id_idx" ON "system_users"("sede_id");
CREATE INDEX "employees_sede_id_idx" ON "employees"("sede_id");
CREATE INDEX "workflow_requests_sede_id_idx" ON "workflow_requests"("sede_id");
CREATE INDEX "dispatch_guides_sede_id_idx" ON "dispatch_guides"("sede_id");

ALTER TABLE "system_users" ADD CONSTRAINT "system_users_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_requests" ADD CONSTRAINT "workflow_requests_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
