-- AlterTable
ALTER TABLE "lineas_telefonicas" ADD COLUMN     "sede_id" TEXT;

-- CreateIndex
CREATE INDEX "lineas_telefonicas_sede_id_idx" ON "lineas_telefonicas"("sede_id");

-- AddForeignKey
ALTER TABLE "lineas_telefonicas" ADD CONSTRAINT "lineas_telefonicas_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sedes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
