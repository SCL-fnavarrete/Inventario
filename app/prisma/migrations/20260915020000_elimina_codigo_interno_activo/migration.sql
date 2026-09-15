-- Se elimina el campo "codigo interno" del activo porque no se usa.
-- La planilla real de inventario de la empresa trae una columna "ID-Interno",
-- pero lo que contiene no es un codigo sino el estado del equipo
-- (Activo/Baja/Disponible/Mantencion), asi que este campo nunca tuvo un dato
-- real detras. Los equipos se identifican por numero de serie.
ALTER TABLE "assets" DROP COLUMN "numero_activo_interno";
