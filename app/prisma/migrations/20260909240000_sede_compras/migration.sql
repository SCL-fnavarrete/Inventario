-- Sede en Compras (9-sep-2026): Compras era el unico modulo operativo sin
-- ninguna relacion a sede, ni directa ni indirecta. Se agrega una columna
-- nullable -- Compras es admin-only, el admin la elige de una lista al
-- crear (o la deja vacia si la compra es transversal, ej. licencias de
-- software para toda la empresa). No hay backfill: las compras existentes
-- quedan sin sede asignada, que es un valor valido (transversal).

ALTER TABLE "purchases" ADD COLUMN "sede_id" TEXT;

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "purchases_sede_id_idx" ON "purchases"("sede_id");
