-- Compras: primero se compra, despues se reparte (SPEC 2.111).
-- Todo lo nuevo parte vacio o en 0: las compras existentes quedan ya repartidas.

-- AlterEnum
ALTER TYPE "EstadoActivo" ADD VALUE 'por_repartir';

-- AlterTable
ALTER TABLE "dispatch_guides" ADD COLUMN     "purchase_id" TEXT;

-- AlterTable
ALTER TABLE "purchase_kit_items" ADD COLUMN     "cantidad_por_repartir" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "purchase_kit_repartos" (
    "id" TEXT NOT NULL,
    "purchase_kit_item_id" TEXT NOT NULL,
    "sede_id" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "guide_id" TEXT,
    "repartido_por" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_kit_repartos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_guide_kit_items" (
    "id" TEXT NOT NULL,
    "guide_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_destino_id" TEXT,
    "cantidad" INTEGER NOT NULL,
    "cantidad_recibida" INTEGER NOT NULL DEFAULT 0,
    "cantidad_perdida" INTEGER NOT NULL DEFAULT 0,
    "estado" "EstadoItemGuia" NOT NULL DEFAULT 'en_transito',
    "motivo_perdida" TEXT,
    "fecha_resolucion" TIMESTAMP(3),
    "resuelto_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_guide_kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_kit_repartos_purchase_kit_item_id_idx" ON "purchase_kit_repartos"("purchase_kit_item_id");

-- CreateIndex
CREATE INDEX "purchase_kit_repartos_guide_id_idx" ON "purchase_kit_repartos"("guide_id");

-- CreateIndex
CREATE INDEX "dispatch_guide_kit_items_guide_id_idx" ON "dispatch_guide_kit_items"("guide_id");

-- CreateIndex
CREATE INDEX "dispatch_guide_kit_items_item_id_idx" ON "dispatch_guide_kit_items"("item_id");

-- CreateIndex
CREATE INDEX "dispatch_guides_purchase_id_idx" ON "dispatch_guides"("purchase_id");

-- AddForeignKey
ALTER TABLE "purchase_kit_repartos" ADD CONSTRAINT "purchase_kit_repartos_purchase_kit_item_id_fkey" FOREIGN KEY ("purchase_kit_item_id") REFERENCES "purchase_kit_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_kit_repartos" ADD CONSTRAINT "purchase_kit_repartos_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_kit_repartos" ADD CONSTRAINT "purchase_kit_repartos_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "dispatch_guides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guide_kit_items" ADD CONSTRAINT "dispatch_guide_kit_items_guide_id_fkey" FOREIGN KEY ("guide_id") REFERENCES "dispatch_guides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guide_kit_items" ADD CONSTRAINT "dispatch_guide_kit_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "welcome_kit_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_guide_kit_items" ADD CONSTRAINT "dispatch_guide_kit_items_item_destino_id_fkey" FOREIGN KEY ("item_destino_id") REFERENCES "welcome_kit_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

