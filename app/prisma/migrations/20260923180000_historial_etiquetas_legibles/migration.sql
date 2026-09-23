-- Solo datos, sin cambios de schema (SPEC 2.85). El historial guardaba el
-- valor interno del estado en su texto ("Estado: danado", "de "en_mantencion"",
-- "discoDuro"); se reescribe con la etiqueta que muestra la interfaz.

-- Devoluciones: "... Estado: <valor>" al final de la descripcion.
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", 'Estado: ok$', 'Estado: Buen estado') WHERE "tipo_evento" = 'devolucion';
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", 'Estado: danado$', 'Estado: Dañado') WHERE "tipo_evento" = 'devolucion';
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", 'Estado: incompleto$', 'Estado: Incompleto') WHERE "tipo_evento" = 'devolucion';
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", 'Estado: no_devuelto$', 'Estado: No devuelto') WHERE "tipo_evento" = 'devolucion';

-- Cambios de estado: 'Estado cambiado de "<valor>" a "<valor>"'.
UPDATE "asset_history" SET "descripcion" = replace("descripcion", '"disponible"', '"Disponible"') WHERE "tipo_evento" = 'cambio_estado';
UPDATE "asset_history" SET "descripcion" = replace("descripcion", '"asignado"', '"Asignado"') WHERE "tipo_evento" = 'cambio_estado';
UPDATE "asset_history" SET "descripcion" = replace("descripcion", '"en_mantencion"', '"En Mantención"') WHERE "tipo_evento" = 'cambio_estado';
UPDATE "asset_history" SET "descripcion" = replace("descripcion", '"no_devuelto"', '"No devuelto"') WHERE "tipo_evento" = 'cambio_estado';
UPDATE "asset_history" SET "descripcion" = replace("descripcion", '"baja"', '"Baja"') WHERE "tipo_evento" = 'cambio_estado';
UPDATE "asset_history" SET "descripcion" = replace("descripcion", '"vendido"', '"Vendido"') WHERE "tipo_evento" = 'cambio_estado';

-- Especificaciones: "Especificaciones actualizadas: discoDuro, ram".
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", '\mprocesador\M', 'Procesador', 'g') WHERE "tipo_evento" = 'actualizacion_specs' AND "descripcion" LIKE 'Especificaciones actualizadas:%';
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", '\mram\M', 'RAM', 'g') WHERE "tipo_evento" = 'actualizacion_specs' AND "descripcion" LIKE 'Especificaciones actualizadas:%';
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", '\mdiscoDuro\M', 'Disco duro', 'g') WHERE "tipo_evento" = 'actualizacion_specs' AND "descripcion" LIKE 'Especificaciones actualizadas:%';
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", '\msistemaOperativo\M', 'Sistema operativo', 'g') WHERE "tipo_evento" = 'actualizacion_specs' AND "descripcion" LIKE 'Especificaciones actualizadas:%';
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", '\mpulgadas\M', 'Pulgadas', 'g') WHERE "tipo_evento" = 'actualizacion_specs' AND "descripcion" LIKE 'Especificaciones actualizadas:%';
