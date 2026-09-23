// Migracion de una sola vez (SPEC 2.78): reemplaza colores fijos de Tailwind
// por los tokens semanticos de globals.css, para que las pantallas sigan
// el tema claro/oscuro. Conserva prefijos de variante (hover:, md:, etc.)
// y opacidad (/50). Idempotente: correrlo de nuevo no cambia nada.
//
//   node scripts/migrar-tokens-tema.mjs          -> aplica y lista cambios
//   node scripts/migrar-tokens-tema.mjs --dry    -> solo cuenta
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '../src');
const CARPETAS = ['app', 'components', 'lib/constants'];
const dry = process.argv.includes('--dry');

// utilidad fija -> token. Los grises que no aparecen aqui (gray-100 de
// fondos, gray-300 de iconos, etc.) se invierten solos en modo oscuro.
const MAPA = {
  'bg-white': 'bg-surface',
  'bg-gray-50': 'bg-surface-muted',
  'text-gray-900': 'text-fg',
  'text-gray-800': 'text-fg',
  'text-gray-700': 'text-fg-muted',
  'text-gray-600': 'text-fg-muted',
  'text-gray-500': 'text-fg-subtle',
  'text-gray-400': 'text-fg-subtle',
  'border-gray-100': 'border-line',
  'border-gray-200': 'border-line',
  'border-gray-300': 'border-line-strong',
  'divide-gray-100': 'divide-line',
  'divide-gray-200': 'divide-line',
  // Rellenos solidos: la escala 700+ se invierte en oscuro y el texto
  // blanco encima perderia contraste. Pasan a tokens fijos.
  'bg-primary-700': 'bg-brand',
  'bg-primary-800': 'bg-brand-hover',
  'bg-green-700': 'bg-success-hover',
  'bg-emerald-700': 'bg-success-hover',
};

// Clase completa: inicio o separador, prefijos de variante, utilidad y
// opacidad opcional (solo para bg-white no se toca la opacidad: bg-white/20
// sobre un relleno de color es un brillo intencional, no una superficie).
const SEP = `(^|[\\s"'\`{(])`;
const VARIANTES = '((?:[a-z0-9-]+:)*)';
const FIN = `(?=[\\s"'\`)}]|$)`;
const utilidades = Object.keys(MAPA).map((u) => u.replace(/-/g, '\\-')).join('|');
const RE = new RegExp(`${SEP}${VARIANTES}(${utilidades})(/\\d+)?${FIN}`, 'gm');

function archivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivos(p);
    return /\.(tsx|ts)$/.test(e.name) ? [p] : [];
  });
}

let total = 0;
for (const carpeta of CARPETAS) {
  for (const archivo of archivos(path.join(RAIZ, carpeta))) {
    const original = fs.readFileSync(archivo, 'utf8');
    let n = 0;
    const nuevo = original.replace(RE, (m, sep, variantes, util, opacidad = '') => {
      if (util === 'bg-white' && opacidad) return m;
      // dark: ya es un valor explicito para el tema oscuro (ej. la pastilla del Logo).
      if (variantes.includes('dark:')) return m;
      n++;
      return `${sep}${variantes}${MAPA[util]}${opacidad}`;
    });
    if (n) {
      total += n;
      console.log(`${String(n).padStart(4)}  ${path.relative(RAIZ, archivo)}`);
      if (!dry) fs.writeFileSync(archivo, nuevo);
    }
  }
}
console.log(`${dry ? '[dry] ' : ''}${total} reemplazos`);
