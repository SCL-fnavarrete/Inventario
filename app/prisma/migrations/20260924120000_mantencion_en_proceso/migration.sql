-- Solo datos, sin cambios de schema (SPEC 2.96). Hasta ahora programar una
-- mantencion dejaba el equipo "En Mantención" con su mantencion "pendiente";
-- desde ahora el equipo entra a mantencion al pulsar Iniciar, y un equipo en
-- mantencion siempre tiene su mantencion "en_proceso" (una sola). Se pasa a
-- en proceso la pendiente mas antigua de cada equipo en mantencion que no
-- tenga ya una en proceso; las demas pendientes siguen programadas.
UPDATE "maintenances" m
SET "estado" = 'en_proceso', "updated_at" = NOW()
WHERE m."id" IN (
  SELECT DISTINCT ON (p."asset_id") p."id"
  FROM "maintenances" p
  JOIN "assets" a ON a."id" = p."asset_id"
  WHERE a."estado" = 'en_mantencion'
    AND p."estado" = 'pendiente'
    AND NOT EXISTS (
      SELECT 1 FROM "maintenances" e
      WHERE e."asset_id" = p."asset_id" AND e."estado" = 'en_proceso'
    )
  ORDER BY p."asset_id", p."fecha_programada" ASC NULLS LAST, p."created_at" ASC
);
