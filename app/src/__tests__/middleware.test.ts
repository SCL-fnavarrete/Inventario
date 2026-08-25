/**
 * @jest-environment node
 *
 * `next/server` necesita las Web APIs globales (Request/Response), que el
 * entorno jsdom por defecto no expone. Node 22 sí las trae.
 */
import { NextRequest } from 'next/server';
import { encode } from 'next-auth/jwt';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

/**
 * Contrato del middleware para las rutas de API.
 *
 * `withAuth` responde a una petición no autorizada con
 * `NextResponse.redirect(signInPage)`. Para una página eso es correcto, pero
 * para `/api/**` significa que un `fetch()` del cliente recibe 307 y termina
 * leyendo el HTML de la página de login. El cliente hace `response.json()` y
 * revienta con `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, que
 * no dice nada del problema real: la sesión expiró.
 *
 * Es el mismo síntoma que produce NextAuth cuando `/api/auth/session` falla
 * (`CLIENT_FETCH_ERROR`), así que en la consola los dos casos son
 * indistinguibles.
 *
 * Lo que se fija aquí: una ruta de API sin sesión responde 401 con el formato
 * de error unificado del proyecto (`{ error: string }`, ver
 * `src/lib/auth/guard.ts`), nunca un redirect a HTML. Las páginas conservan el
 * redirect a `/login`.
 */

const SECRET = 'secret-de-test-de-al-menos-32-caracteres-para-nextauth';

// `withAuth` lee ambas de `process.env` en cada invocación: el secreto para
// desencriptar el JWT, y `NEXTAUTH_URL` para saber qué prefijo es el de las
// rutas propias de NextAuth. Se fijan aquí para que el test no dependa del
// `.env` de la máquina.
process.env.NEXTAUTH_SECRET = SECRET;
process.env.NEXTAUTH_URL = 'http://localhost:3000';

// Importado después de fijar las variables de entorno, a propósito.
import middleware, { config } from '@/middleware';

/**
 * `withAuth` declara su tipo como `(req: NextRequestWithAuth, event:
 * NextFetchEvent)`, pero sólo usa `req`: `event` viaja hasta la función
 * envuelta sin ser leído. Se invoca con un único argumento a propósito, para
 * ejercitar el middleware real —incluido el redirect de `withAuth`— en vez de
 * mockearlo.
 */
type MiddlewareInvocable = (req: NextRequest) => Promise<Response | undefined>;
const ejecutar = middleware as unknown as MiddlewareInvocable;

async function pedir(ruta: string, opciones: { conSesion?: boolean } = {}) {
  const headers = new Headers();

  if (opciones.conSesion) {
    const jwt = await encode({
      token: { id: 'usuario-1', role: 'admin', email: 'admin@sclconsultores.com' },
      secret: SECRET,
    });
    // Nombre de cookie sin prefijo seguro porque `NEXTAUTH_URL` es http.
    headers.set('cookie', `next-auth.session-token=${jwt}`);
  }

  return ejecutar(new NextRequest(new URL(`http://localhost:3000${ruta}`), { headers }));
}

/** `NextResponse.next()` no es un 200 cualquiera: lleva esta cabecera. */
function dejaPasar(respuesta: Response | undefined) {
  return respuesta === undefined || respuesta.headers.has('x-middleware-next');
}

function coincideMatcher(ruta: string): boolean {
  return unstable_doesMiddlewareMatch({
    config,
    url: `http://localhost:3000${ruta}`,
  });
}

describe('middleware — selección de rutas', () => {
  test.each(['/api/activos.png', '/api/empleados/foto.jpg', '/api/documentos/logo.svg'])(
    '%s activa el middleware aunque termine como imagen',
    (ruta) => {
      expect(coincideMatcher(ruta)).toBe(true);
    }
  );

  test.each(['/imagen-publica.png', '/avatars/empleado.jpg', '/marca.svg', '/api/auth/logo.png'])(
    '%s queda fuera del middleware',
    (ruta) => {
      expect(coincideMatcher(ruta)).toBe(false);
    }
  );
});

describe('middleware — rutas de API sin sesión', () => {
  test('responde 401 en vez de redirigir a una página HTML', async () => {
    const respuesta = await pedir('/api/activos');

    expect(respuesta?.status).toBe(401);
  });

  test('responde JSON con la clave `error` del formato unificado', async () => {
    const respuesta = await pedir('/api/activos');

    expect(respuesta?.headers.get('content-type')).toContain('application/json');
    const cuerpo = (await respuesta!.json()) as { error?: string };
    expect(typeof cuerpo.error).toBe('string');
    expect(cuerpo.error).toBeTruthy();
  });

  test('no emite cabecera Location: un fetch no debe seguir un redirect a HTML', async () => {
    const respuesta = await pedir('/api/activos');

    expect(respuesta?.headers.get('location')).toBeNull();
  });

  test.each([
    '/api/activos',
    '/api/empleados/123',
    '/api/solicitudes',
    '/api/reportes/stock',
  ])('%s responde 401 JSON', async (ruta) => {
    const respuesta = await pedir(ruta);

    expect(respuesta?.status).toBe(401);
    expect(respuesta?.headers.get('content-type')).toContain('application/json');
  });
});

describe('middleware — comportamiento que no debe cambiar', () => {
  test('una página sin sesión sigue redirigiendo a /login', async () => {
    const respuesta = await pedir('/activos');

    expect(respuesta?.status).toBe(307);
    expect(new URL(respuesta!.headers.get('location')!).pathname).toBe('/login');
  });

  test('/login sin sesión pasa sin redirigir', async () => {
    const respuesta = await pedir('/login');

    expect(dejaPasar(respuesta)).toBe(true);
  });

  test('las rutas propias de NextAuth nunca se interceptan', async () => {
    const respuesta = await pedir('/api/auth/session');

    expect(dejaPasar(respuesta)).toBe(true);
  });

  test('una ruta de API con sesión válida llega al handler', async () => {
    const respuesta = await pedir('/api/activos', { conSesion: true });

    expect(dejaPasar(respuesta)).toBe(true);
  });

  test('una página con sesión válida llega a la página', async () => {
    const respuesta = await pedir('/activos', { conSesion: true });

    expect(dejaPasar(respuesta)).toBe(true);
  });

  test('/login con sesión válida redirige al dashboard', async () => {
    const respuesta = await pedir('/login', { conSesion: true });

    expect(respuesta?.status).toBe(307);
    expect(new URL(respuesta!.headers.get('location')!).pathname).toBe('/');
  });
});
