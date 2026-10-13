/**
 * Paleta de colores y tema oscuro (docs/DESIGN_SYSTEM.md): solo las escalas que
 * globals.css ajusta en modo oscuro se pueden usar en las pantallas. Una escala
 * sin ajuste (violet, indigo, fuchsia, pink...) se vería con fondos claros
 * dentro del tema oscuro.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', '..');
const CSS = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');

const ESCALAS = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'slate'];
const AJUSTADAS = ESCALAS.filter((e) => new RegExp(`--color-${e}-50:`).test(CSS));
const SIN_AJUSTE = ESCALAS.filter((e) => !AJUSTADAS.includes(e));

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === '__tests__' ? [] : archivos(ruta);
    return /\.(tsx?|css)$/.test(nombre) && !ruta.endsWith('globals.css') ? [ruta] : [];
  });
}

describe('paleta de colores', () => {
  test('globals.css ajusta en oscuro las escalas de estado más usadas', () => {
    for (const e of ['red', 'green', 'amber', 'yellow', 'orange', 'purple', 'blue', 'sky', 'teal']) {
      expect(AJUSTADAS).toContain(e);
    }
  });

  test('ninguna pantalla usa una escala sin versión oscura', () => {
    const patron = new RegExp(`\b(bg|text|border|ring|from|to|via|divide)-(${SIN_AJUSTE.join('|')})-\d{2,3}\b`);
    const usos = archivos(SRC)
      .filter((f) => patron.test(readFileSync(f, 'utf8')))
      .map((f) => f.replace(SRC, ''));
    expect(usos).toEqual([]);
  });
});
