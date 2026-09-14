-- Compras se simplifica a solo dos datos (11-sep-2026, pedido explicito de
-- Javier): la factura (para relacionarla) y los equipos que vinieron con
-- ella. El area de soporte no necesita ni le interesa el dato financiero
-- (monto, moneda, metodo de pago, precio unitario por equipo) ni el
-- proveedor. Se eliminan esas columnas; no hay backfill posible ni
-- necesario porque el dato deja de tener uso en el sistema.
--
-- El modelo `Supplier`/tabla "suppliers" y su API (`/api/proveedores`) no se
-- tocan: quedan como un directorio de proveedores independiente, ya no
-- referenciado desde compras.

ALTER TABLE "purchases" DROP CONSTRAINT "purchases_supplier_id_fkey";

ALTER TABLE "purchases"
  DROP COLUMN "supplier_id",
  DROP COLUMN "monto_total",
  DROP COLUMN "moneda",
  DROP COLUMN "metodo_pago";

ALTER TABLE "purchase_assets" DROP COLUMN "precio_unitario";

DROP TYPE "Moneda";
DROP TYPE "MetodoPago";
