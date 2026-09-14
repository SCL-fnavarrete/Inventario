-- Activos (14-sep-2026, SPEC 2.25): se agrega la fecha real en que se vendio
-- el activo. Antes no existia ninguna columna para esto y el historial
-- (AssetHistory) siempre guardaba la fecha de HOY, ignorando la fecha que la
-- persona ingresaba en el formulario de venta. Pedido explicito de Javier:
-- "al vender un activo no es necesario documento, solo basta con poner la
-- fecha en la que fue vendido" -- de paso se saca el campo "documento de
-- venta" (URL), que confirmo que no hace falta.

ALTER TABLE "assets" ADD COLUMN "fecha_venta" TIMESTAMP(3);
