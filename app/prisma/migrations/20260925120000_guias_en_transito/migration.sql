-- SPEC 2.108: los equipos de una guia de despacho viajan "En transito" y
-- pasan a la sede destino recien cuando esta confirma que llegaron.

-- Estado nuevo del activo.
ALTER TYPE "EstadoActivo" ADD VALUE 'en_transito';

-- Estados de la guia: se renombran los dos que habia (sin perder datos) y
-- se agregan los nuevos.
ALTER TYPE "EstadoGuia" RENAME VALUE 'despachado' TO 'en_transito';
ALTER TYPE "EstadoGuia" RENAME VALUE 'realizado' TO 'recibida';
ALTER TYPE "EstadoGuia" ADD VALUE 'recibida_parcial' BEFORE 'recibida';
ALTER TYPE "EstadoGuia" ADD VALUE 'anulada';
ALTER TABLE "dispatch_guides" ALTER COLUMN "estado" SET DEFAULT 'en_transito';

-- Anulacion de la guia.
ALTER TABLE "dispatch_guides"
  ADD COLUMN "fecha_anulacion" TIMESTAMP(3),
  ADD COLUMN "anulada_por" TEXT,
  ADD COLUMN "motivo_anulacion" TEXT;

-- Estado de cada equipo dentro de la guia.
CREATE TYPE "EstadoItemGuia" AS ENUM ('en_transito', 'recibido', 'perdido');
ALTER TABLE "dispatch_guide_items"
  ADD COLUMN "estado" "EstadoItemGuia" NOT NULL DEFAULT 'en_transito',
  ADD COLUMN "fecha_resolucion" TIMESTAMP(3),
  ADD COLUMN "resuelto_por" TEXT;

-- Guias creadas antes de este cambio: su traslado ya se aplico al crearlas
-- (los equipos ya estan en la sede destino). Quedan como recibidas, con sus
-- equipos recibidos, para que confirmarlas no vuelva a mover nada.
UPDATE "dispatch_guide_items" SET "estado" = 'recibido';
UPDATE "dispatch_guides" SET "estado" = 'recibida';
