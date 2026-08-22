import fs from 'fs';
import path from 'path';
import { RECURSOS, ACCIONES } from '@/lib/auth/permissions';

/**
 * Auditoría estática de las rutas de API.
 *
 * El hallazgo C-1 fue que 17 de 63 rutas no verificaban sesión y sólo 8
 * verificaban rol, y que nada lo detectaba. Corregirlo una vez no sirve si la
 * ruta 64 vuelve a olvidarlo, así que la verificación vive aquí: cada handler
 * exportado debe abrir con `requirePermission` y cerrar con `handleApiError`.
 *
 * Si esto falla al agregar una ruta nueva, la ruta está desprotegida — no es
 * el test el que está de más.
 */

const API_DIR = path.join(process.cwd(), 'src', 'app', 'api');

/** Única ruta pública: la maneja NextAuth. */
const EXCLUIDAS = [path.join('auth', '[...nextauth]', 'route.ts')];

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function listarRutas(dir: string): string[] {
  const encontradas: string[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      encontradas.push(...listarRutas(completa));
    } else if (entrada.name === 'route.ts') {
      encontradas.push(completa);
    }
  }
  return encontradas;
}

const rutas = listarRutas(API_DIR)
  .map((p) => path.relative(API_DIR, p))
  .filter((rel) => !EXCLUIDAS.includes(rel))
  .sort();

/** Trozo de código de cada handler exportado, desde su firma hasta el siguiente. */
function handlersDe(contenido: string): Array<{ metodo: string; cuerpo: string }> {
  const marcas: Array<{ metodo: string; inicio: number }> = [];
  for (const metodo of METODOS) {
    const re = new RegExp(`export async function ${metodo}\\s*\\(`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(contenido)) !== null) {
      marcas.push({ metodo, inicio: m.index });
    }
  }
  marcas.sort((a, b) => a.inicio - b.inicio);

  return marcas.map((marca, i) => ({
    metodo: marca.metodo,
    cuerpo: contenido.slice(
      marca.inicio,
      i + 1 < marcas.length ? marcas[i + 1].inicio : contenido.length
    ),
  }));
}

describe('rutas de API — cobertura de autorización', () => {
  test('se encontraron rutas para auditar', () => {
    expect(rutas.length).toBeGreaterThan(50);
  });

  describe.each(rutas)('%s', (rel) => {
    const contenido = fs.readFileSync(path.join(API_DIR, rel), 'utf8');
    const handlers = handlersDe(contenido);

    test('exporta al menos un handler HTTP', () => {
      expect(handlers.length).toBeGreaterThan(0);
    });

    test.each(handlers.map((h) => [h.metodo, h.cuerpo] as const))(
      '%s exige un permiso explícito',
      (_metodo, cuerpo) => {
        expect(cuerpo).toMatch(/requirePermission\(/);
      }
    );

    test.each(handlers.map((h) => [h.metodo, h.cuerpo] as const))(
      '%s traduce sus errores con handleApiError',
      (_metodo, cuerpo) => {
        expect(cuerpo).toMatch(/handleApiError\(/);
      }
    );

    test('no verifica roles por su cuenta: la matriz es el único punto de verdad', () => {
      // `session.user.role !== 'admin'` disperso por las rutas fue el origen
      // de que la UI y la API pudieran discrepar.
      expect(contenido).not.toMatch(/session\.user\.role\s*[!=]==/);
      expect(contenido).not.toMatch(/const userRole\s*=/);
    });

    test('ya no arma su propia respuesta 401', () => {
      expect(contenido).not.toMatch(/status:\s*401/);
    });

    test('los permisos que declara existen en la matriz', () => {
      const usos = [...contenido.matchAll(/requirePermission\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)];
      expect(usos.length).toBeGreaterThan(0);
      for (const [, recurso, accion] of usos) {
        expect(RECURSOS).toContain(recurso);
        expect(ACCIONES).toContain(accion);
      }
    });
  });
});
