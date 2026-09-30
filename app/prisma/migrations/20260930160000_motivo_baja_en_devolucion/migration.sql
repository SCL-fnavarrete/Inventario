-- SPEC 2.126: la baja desde un cambio de equipo va directo, sin mantencion;
-- el motivo de la lista queda en la asignacion devuelta.
-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "motivo_baja_id" TEXT;

-- CreateIndex
CREATE INDEX "assignments_motivo_baja_id_idx" ON "assignments"("motivo_baja_id");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_motivo_baja_id_fkey" FOREIGN KEY ("motivo_baja_id") REFERENCES "motivos_baja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

