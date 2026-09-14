-- Activos (14-sep-2026): Javier pidio sacar el campo "Operador" (operador
-- telefonico -- Entel/Movistar/WOM/Claro) de la categoria Celular. Se
-- confirmo con el que no hay ningun celular con este dato cargado antes de
-- borrar la columna -- no se pudo verificar directamente en la base porque
-- el workspace del dispositivo seguia caido (mismo problema del 8-sep). No
-- se toca ningun otro campo de Celular (imei, numeroTelefono,
-- numeroActivacion, tipoPlan, tieneCargador).

ALTER TABLE "assets" DROP COLUMN "operador";
