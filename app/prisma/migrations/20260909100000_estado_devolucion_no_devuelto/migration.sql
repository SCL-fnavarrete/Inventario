-- Tercera opcion al recibir equipos en un offboarding: el empleado no lo
-- entrego. Va en su propia migracion porque Postgres no permite agregar un
-- valor a un enum y usarlo dentro de la misma transaccion.

ALTER TYPE "EstadoDevolucion" ADD VALUE 'no_devuelto';
