-- Compras (11-sep-2026, pedido explicito de Javier): se agrega el RUT del
-- proveedor que emitio la factura (texto libre, validado en la capa de
-- aplicacion con el mismo digito verificador que el rut de un empleado) y
-- se elimina el campo de URL del documento -- ya no se usa. No hay
-- backfill de rut_proveedor: las facturas existentes no tienen ese dato.

ALTER TABLE "purchases" ADD COLUMN "rut_proveedor" TEXT;

ALTER TABLE "purchases" DROP COLUMN "documento_url";
