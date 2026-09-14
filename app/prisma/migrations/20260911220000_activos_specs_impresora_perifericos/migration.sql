-- Activos (11-sep-2026, pedido explicito de Javier): se agregan campos
-- especificos para Impresora (tipo, conexion, IP) y un campo compartido
-- de conectividad para los perifericos simples (Mouse, Teclado, Webcam,
-- Audifonos). No hay backfill: los activos existentes de esas categorias
-- no tenian estos datos registrados.

ALTER TABLE "assets" ADD COLUMN "tipo_impresora" TEXT;
ALTER TABLE "assets" ADD COLUMN "conexion_impresora" TEXT;
ALTER TABLE "assets" ADD COLUMN "ip_impresora" TEXT;
ALTER TABLE "assets" ADD COLUMN "conectividad" TEXT;
