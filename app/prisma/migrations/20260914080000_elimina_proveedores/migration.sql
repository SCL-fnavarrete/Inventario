-- Elimina el modulo Proveedores (14-sep-2026, pedido explicito de Javier:
-- "elimina la tabla de proveedores"). Ya estaba desvinculada de Purchase
-- desde el 11-sep-2026 (ver migracion 20260911200000_compras_solo_factura_y_equipos)
-- y Javier confirmo que la tabla no se usaba. Sin FKs entrantes -- se puede
-- eliminar directo, sin pasos intermedios.

-- DropTable
DROP TABLE "suppliers";
