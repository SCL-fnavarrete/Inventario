-- AssetHistory (14-sep-2026, SPEC 2.25): nuevo valor de TipoEvento para
-- cuando se vincula un activo YA EXISTENTE a una compra/factura. Antes solo
-- quedaba rastro en el historial si el activo se creaba desde el alta
-- rapida de Nueva Compra -- vincular uno ya existente no dejaba ningun
-- registro de esa asociacion.

ALTER TYPE "TipoEvento" ADD VALUE 'compra';
