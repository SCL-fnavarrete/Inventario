-- Compras (SPEC 2.111): equipo comprado en la compra (pasa por el reparto) o solo vinculado.

-- AlterTable
ALTER TABLE "purchase_assets" ADD COLUMN     "llego_con_compra" BOOLEAN NOT NULL DEFAULT false;

