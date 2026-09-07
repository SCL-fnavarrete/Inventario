-- Reemplaza los 3 checkboxes fijos de onboarding (requiere_notebook/celular/monitor)
-- por una lista abierta de categorias de inventario requeridas, para poder pedir
-- cualquier categoria (Impresora, Mouse, Teclado, Docking Station, Webcam, Audifonos, etc.)
-- y no solo las 3 originales.

-- AlterTable: agrega la nueva columna
ALTER TABLE "workflow_requests" ADD COLUMN "categorias_requeridas" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: convierte los booleanos existentes en la nueva lista antes de eliminarlos
UPDATE "workflow_requests"
SET "categorias_requeridas" = ARRAY_REMOVE(ARRAY[
  CASE WHEN "requiere_notebook" THEN 'Notebook' END,
  CASE WHEN "requiere_celular" THEN 'Celular' END,
  CASE WHEN "requiere_monitor" THEN 'Monitor' END
], NULL);

-- AlterTable: elimina las columnas booleanas reemplazadas
ALTER TABLE "workflow_requests" DROP COLUMN "requiere_notebook";
ALTER TABLE "workflow_requests" DROP COLUMN "requiere_celular";
ALTER TABLE "workflow_requests" DROP COLUMN "requiere_monitor";
