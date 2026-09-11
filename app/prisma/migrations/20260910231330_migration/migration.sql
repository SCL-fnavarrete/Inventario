-- DropForeignKey
ALTER TABLE "dispatch_guides" DROP CONSTRAINT "dispatch_guides_sede_destino_id_fkey";

-- AddForeignKey
ALTER TABLE "dispatch_guides" ADD CONSTRAINT "dispatch_guides_sede_destino_id_fkey" FOREIGN KEY ("sede_destino_id") REFERENCES "sedes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
