-- Solo datos, sin cambios de schema (SPEC 2.86). La baja guardaba el motivo
-- interno en el texto del historial ("Activo dado de baja: falla_irreparable");
-- se reescribe con la etiqueta que muestra la interfaz.
UPDATE "asset_history" SET "descripcion" = 'Activo dado de baja: Obsolescencia' WHERE "tipo_evento" = 'baja' AND "descripcion" = 'Activo dado de baja: obsolescencia';
UPDATE "asset_history" SET "descripcion" = 'Activo dado de baja: Falla irreparable' WHERE "tipo_evento" = 'baja' AND "descripcion" = 'Activo dado de baja: falla_irreparable';
UPDATE "asset_history" SET "descripcion" = 'Activo dado de baja: Robo' WHERE "tipo_evento" = 'baja' AND "descripcion" = 'Activo dado de baja: robo';
UPDATE "asset_history" SET "descripcion" = 'Activo dado de baja: Extravío' WHERE "tipo_evento" = 'baja' AND "descripcion" = 'Activo dado de baja: extravio';
UPDATE "asset_history" SET "descripcion" = regexp_replace("descripcion", '^Activo dado de baja: otro: ', 'Activo dado de baja: Otro: ') WHERE "tipo_evento" = 'baja';
