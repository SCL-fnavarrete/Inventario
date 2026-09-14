-- Activos (11-sep-2026, mismo dia): Javier revisó la sección de
-- especificaciones de Impresora agregada en la migración anterior
-- (20260911220000_activos_specs_impresora_perifericos) y decidió que no
-- era necesaria ("no creo que sea necesario para una impresora"). Se
-- eliminan las tres columnas. `conectividad` (perifericos simples) se
-- mantiene, no se tocó.

ALTER TABLE "assets" DROP COLUMN "tipo_impresora";
ALTER TABLE "assets" DROP COLUMN "conexion_impresora";
ALTER TABLE "assets" DROP COLUMN "ip_impresora";
