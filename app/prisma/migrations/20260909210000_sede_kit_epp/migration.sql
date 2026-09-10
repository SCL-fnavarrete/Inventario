-- Extiende el aislamiento de datos por sede (SPEC 2.9) al catalogo de Kit de
-- Bienvenida / EPP: cada sede tiene su propio catalogo y su propio stock,
-- igual que Asset/Employee -- no un catalogo global compartido. Tabla real
-- "welcome_kit_items" (@@map del modelo WelcomeKitItem).

-- 1. Columna nueva.
ALTER TABLE "welcome_kit_items" ADD COLUMN "sede_id" TEXT;

-- 2. Backfill a Santiago (misma logica que 20260909170000_sede_scoping): los
-- articulos existentes no tienen forma de saber de que sede son realmente,
-- asi que quedan visibles para soporte de esa sede en vez de desaparecer
-- (un tecnico sin sede asignada no ve nada, ver sedeWhere()). El admin puede
-- reasignarlos despues.
UPDATE "welcome_kit_items" SET "sede_id" = (SELECT "id" FROM "sedes" WHERE "codigo" = 'STGO')
WHERE "sede_id" IS NULL;

-- 3. Indice y llave foranea.
CREATE INDEX "welcome_kit_items_sede_id_idx" ON "welcome_kit_items"("sede_id");

ALTER TABLE "welcome_kit_items" ADD CONSTRAINT "welcome_kit_items_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
