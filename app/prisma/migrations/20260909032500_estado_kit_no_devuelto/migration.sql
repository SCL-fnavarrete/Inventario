-- "no_devuelto" para EstadoKit: el articulo (EPP) no fue devuelto en el
-- offboarding, pero el empleado se queda con el -- no es lo mismo que
-- "perdido" (que se usaba antes para no_devuelto tambien, mezclando "no
-- se sabe donde esta" con "sabemos que se lo quedo la persona"). No repone
-- stock, igual que "perdido".
ALTER TYPE "EstadoKit" ADD VALUE 'no_devuelto';
