import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const RUTA_LOGIN = "/login";

/** `/api/**` responde JSON; el resto son páginas y responden HTML. */
function esRutaApi(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (!token) {
      // Una ruta de API tiene que contestar con el formato de error unificado
      // del proyecto (ver `src/lib/auth/guard.ts`). Si en su lugar se redirige
      // a la página de login, el `fetch()` del cliente sigue el redirect,
      // recibe HTML y falla al parsearlo con `Unexpected token '<', "<!DOCTYPE
      // "... is not valid JSON` — un mensaje que no dice que la sesión expiró.
      if (esRutaApi(path)) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
      }

      if (path !== RUTA_LOGIN) {
        return NextResponse.redirect(new URL(RUTA_LOGIN, req.url));
      }
    }

    // Si el usuario está autenticado y está en login, redirigir a dashboard
    if (token && path === RUTA_LOGIN) {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Cuando este callback devuelve `false`, `withAuth` responde por su
      // cuenta con un redirect a su página de signIn — siempre HTML, sin
      // distinguir entre una API y una página. Por eso concede el paso a todo
      // y la autorización la resuelve la función de arriba, que es la única
      // que puede elegir el formato de la respuesta.
      //
      // La consecuencia buscada: `/api/**` sin sesión da 401 JSON, y las
      // páginas van a `/login` en un solo salto en vez de rebotar por
      // `/api/auth/signin`.
      authorized: () => true,
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all API paths except NextAuth, even if the API resource happens
     * to end in an image extension. The second matcher handles pages except:
     * - api/auth (NextAuth API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/api/((?!auth(?:/|$)).*)',
    '/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
};
