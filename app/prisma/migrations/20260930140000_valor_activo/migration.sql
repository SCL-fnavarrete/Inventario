-- SPEC 2.124: valor del equipo en CLP (opcional) y el valor que tenia cuando
-- quedo "No devuelto", guardado en la asignacion para RRHH.
ALTER TABLE "assets" ADD COLUMN "valor" INTEGER;
ALTER TABLE "assignments" ADD COLUMN "valor_no_devuelto" INTEGER;
