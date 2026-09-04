-- Limpieza de los datos de prueba del importador y del formulario de asignacion.
-- Borra los activos con sufijo de serie ZZ4 / ZZ5 y los empleados ficticios
-- (RUT 30.111.xxx o nombre que empieza con ZZTEST).
--
-- Uso, desde la carpeta app:
--   npx prisma db execute --file ./scripts/limpiar-test-import.sql --schema ./prisma/schema.prisma

CREATE TEMP TABLE _activos_test AS
SELECT id FROM assets
WHERE numero_serie LIKE '%ZZ4' OR numero_serie LIKE 'ZZ5-%' OR marca = 'ZZTEST';

CREATE TEMP TABLE _empleados_test AS
SELECT id FROM employees WHERE rut LIKE '30.111.%' OR nombre LIKE 'ZZTEST%';

UPDATE assets SET empleado_actual_id = NULL
WHERE empleado_actual_id IN (SELECT id FROM _empleados_test);

UPDATE dispatch_guides SET destinatario_id = NULL
WHERE destinatario_id IN (SELECT id FROM _empleados_test);

DELETE FROM asset_history WHERE asset_id IN (SELECT id FROM _activos_test);
DELETE FROM maintenances  WHERE asset_id IN (SELECT id FROM _activos_test);
DELETE FROM assignments   WHERE asset_id IN (SELECT id FROM _activos_test)
                             OR employee_id IN (SELECT id FROM _empleados_test);

DELETE FROM kit_assignments   WHERE employee_id IN (SELECT id FROM _empleados_test);
DELETE FROM terminations      WHERE employee_id IN (SELECT id FROM _empleados_test);
DELETE FROM workflow_requests WHERE employee_id IN (SELECT id FROM _empleados_test);

DELETE FROM assets    WHERE id IN (SELECT id FROM _activos_test);
DELETE FROM employees WHERE id IN (SELECT id FROM _empleados_test);
