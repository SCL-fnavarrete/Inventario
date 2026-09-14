-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "condicion_cargador_devolucion" "EstadoDevolucionTipo",
ADD COLUMN     "condicion_cargador_entrega" "EstadoDevolucionTipo",
ADD COLUMN     "observaciones_cargador" TEXT;
