-- Agrega soporte para comprar/reponer stock de Kit/EPP desde una factura
-- (14-sep-2026, SPEC 2.36, pedido explicito de Javier: "aveces el kit de
-- bievenida o epp tambien lo compran y aqui al registrar una factura ...
-- solo funciona con los equipos pero no con el kitt de bievenida o epp").

-- CreateTable
CREATE TABLE "purchase_kit_items" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_kit_items_purchase_id_idx" ON "purchase_kit_items"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_kit_items_item_id_idx" ON "purchase_kit_items"("item_id");

-- AddForeignKey
ALTER TABLE "purchase_kit_items" ADD CONSTRAINT "purchase_kit_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_kit_items" ADD CONSTRAINT "purchase_kit_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "welcome_kit_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
