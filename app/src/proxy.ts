// Proxy de Next.js 16 (antes middleware.ts, convencion obsoleta desde
// Next 16): exige sesion en todas las rutas salvo /login y /api/auth, y
// agrega la CSP con nonce a las paginas.
import { withAuth, type NextRequestWithAuth } from "next-auth/middleware";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { seguirConCsp } from "@/lib/seguridad/csp";

const esApi = (path: string) => path.startsWith("/api/");

/** Quien pasa y a donde se redirige al que no tiene sesion. */
const conSesion = withAuth(
  function exigirSesion(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Si el usuario no está autenticado y no está en login, redirigir a login.
    // La API no se redirige: responde 401 en cada ruta (requirePermission).
    if (!token && path !== "/login" && !esApi(path)) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Con sesion, el login lo decide su propio layout, que revisa la cuenta
    // en la base: aqui una cuenta desactivada todavia tiene su cookie y se
    // produciria un ciclo login -> inicio -> login (SPEC 2.112).

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // Permitir acceso a login sin autenticación. La API tampoco pasa por
        // aqui: cada ruta exige sesion con requirePermission y responde 401
        // en JSON; antes el proxy la redirigia a la pantalla de login (HTML).
        if (path === "/login" || esApi(path)) {
          return true;
        }

        // Para todas las demás rutas, requerir autenticación
        return !!token;
      },
    },
    // Sin esto, withAuth redirige al no autenticado a su pantalla generica
    // /api/auth/signin en vez del /login propio de la app (que si esta
    // declarado en authOptions.pages, pero ese archivo no lo importa este
    // proxy). Hallazgo F-1 de la auditoria de seguridad, 2026-09-17.
    pages: {
      signIn: "/login",
    },
  }
);

/**
 * Primero la sesion; despues, a toda pagina que sigue, su CSP con un nonce
 * nuevo (lib/seguridad/csp.ts). La CSP va aqui afuera y no dentro de
 * withAuth porque withAuth no llama a su funcion en /login: el login quedaba
 * sin CSP (auditoria 28-sep-2026, 1.3).
 */
export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  const respuesta = await conSesion(req as NextRequestWithAuth, event);

  // Una redireccion (al login) u otra respuesta propia sale tal cual.
  if (respuesta && !respuesta.headers.get("x-middleware-next")) return respuesta;
  // La API responde JSON y PDF: no lleva CSP (en un PDF bloquea el visor).
  if (esApi(req.nextUrl.pathname)) return respuesta ?? NextResponse.next();
  return seguirConCsp(req);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth (NextAuth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)",
  ],
};
