-- Lineas (SPEC 2.131): el historial sobrevive a la eliminacion de la linea,
-- para que el costo de los meses pasados no cambie, y los tipos de chip base
-- pasan a dos valores: Fisico y eSIM / MFF.

-- La linea eliminada deja su historial (sin llave foranea) con un evento de cierre.
ALTER TABLE "lineas_historial" DROP CONSTRAINT "lineas_historial_linea_id_fkey";
ALTER TYPE "TipoEventoLinea" ADD VALUE 'eliminacion';

-- Tipos de chip: se renombran los dos de base; las lineas apuntan por id y los conservan.
UPDATE "tipos_chip" SET "nombre" = 'Físico'
WHERE "nombre" = 'Chip físico' AND NOT EXISTS (SELECT 1 FROM "tipos_chip" WHERE "nombre" = 'Físico');
UPDATE "tipos_chip" SET "nombre" = 'eSIM / MFF'
WHERE "nombre" = 'eSIM' AND NOT EXISTS (SELECT 1 FROM "tipos_chip" WHERE "nombre" = 'eSIM / MFF');
