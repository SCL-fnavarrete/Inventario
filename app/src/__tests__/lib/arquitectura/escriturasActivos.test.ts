/**
 * @jest-environment node
 */
// Monolito modular (SPEC 2.118): solo el modulo Activos escribe en las tablas
// de activos y de su historial. Los demas modulos usan cambiarEstado y las
// funciones de modules/activos. Si alguien vuelve a escribir directo, este
// test lo detecta (igual que rutas-protegidas con los permisos).
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(__dirname, '..', '..', '..');
// Solo el modulo Activos: sus rutas de API tambien llaman a su servicio.
const PERMITIDOS = [path.join('modules', 'activos')];
const ESCRITURA = /\.(asset|assetHistory)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : archivos(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

test('ningún módulo fuera de Activos escribe en sus tablas', () => {
  const todos = archivos(SRC);
  expect(todos.length).toBeGreaterThan(100); // de verdad recorre el codigo
  const infractores = todos
    .filter((f) => !PERMITIDOS.some((p) => path.relative(SRC, f).startsWith(p)))
    .flatMap((f) =>
      fs
        .readFileSync(f, 'utf8')
        .split('\n')
        .map((linea, i) => (ESCRITURA.test(linea) ? `${path.relative(SRC, f)}:${i + 1}` : null))
        .filter((x): x is string => x !== null)
    );
  expect(infractores).toEqual([]);
});
