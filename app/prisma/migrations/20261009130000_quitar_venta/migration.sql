-- Se quita "Registrar venta" (SPEC 2.141): ya no existe el estado Vendido ni el evento de venta.

-- Los equipos que estaban vendidos pasan a Baja y su historial de venta queda como baja.
UPDATE "assets"
SET "estado" = 'baja',
    "fecha_baja" = COALESCE("fecha_baja", "fecha_venta"),
    "motivo_baja" = COALESCE("motivo_baja", 'Vendido')
WHERE "estado" = 'vendido';
UPDATE "asset_history" SET "tipo_evento" = 'baja' WHERE "tipo_evento" = 'venta';

ALTER TABLE "assets" DROP COLUMN "fecha_venta";

-- EstadoActivo sin "vendido".
ALTER TYPE "EstadoActivo" RENAME TO "EstadoActivo_old";
CREATE TYPE "EstadoActivo" AS ENUM ('disponible', 'asignado', 'en_mantencion', 'baja', 'no_devuelto', 'en_transito', 'por_repartir');
ALTER TABLE "assets" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "assets" ALTER COLUMN "estado" TYPE "EstadoActivo" USING ("estado"::text::"EstadoActivo");
ALTER TABLE "assets" ALTER COLUMN "estado" SET DEFAULT 'disponible';
DROP TYPE "EstadoActivo_old";

-- TipoEvento sin "venta".
ALTER TYPE "TipoEvento" RENAME TO "TipoEvento_old";
CREATE TYPE "TipoEvento" AS ENUM ('creacion', 'asignacion', 'devolucion', 'mantencion', 'cambio_estado', 'actualizacion_specs', 'baja', 'solicitud_workflow', 'traslado', 'compra');
ALTER TABLE "asset_history" ALTER COLUMN "tipo_evento" TYPE "TipoEvento" USING ("tipo_evento"::text::"TipoEvento");
DROP TYPE "TipoEvento_old";
