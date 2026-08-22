import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../../');

const scripts = [
  {
    path: 'app/scripts/migrate_excel_feb2026.js',
    guard: /throw new Error\(/,
    firstImport: /require\(/,
  },
  { path: 'migration_script.py', guard: /^raise SystemExit\(/m, firstImport: /^(?:import|from) /m },
  { path: 'migration_v2.py', guard: /^raise SystemExit\(/m, firstImport: /^(?:import|from) /m },
  { path: 'migration_v3.py', guard: /^raise SystemExit\(/m, firstImport: /^(?:import|from) /m },
] as const;

describe('migradores legacy bloqueados', () => {
  test.each(scripts)('%s falla antes de cargar dependencias o mutar datos', ({ path, guard, firstImport }) => {
    const source = readFileSync(resolve(repoRoot, path), 'utf8');
    const importIndex = source.search(firstImport);
    const guardIndex = source.search(guard);

    expect(importIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(guardIndex).toBeLessThan(importIndex);
  });
});
