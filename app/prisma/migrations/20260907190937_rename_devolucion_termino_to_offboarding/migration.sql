-- Renombra el tipo de solicitud "devolucion_termino" a "offboarding".
-- ALTER TYPE ... RENAME VALUE conserva todas las filas existentes que usan
-- este valor (no hace falta backfill: es un rename atomico del enum).
ALTER TYPE "TipoSolicitud" RENAME VALUE 'devolucion_termino' TO 'offboarding';
