import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Si el usuario no está autenticado y no está en login, redirigir a login
    if (!token && path !== "/login") {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Si el usuario está autenticado y está en login, redirigir a dashboard
    if (token && path === "/login") {
      return NextResponse.redirect(new URL("/", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // Permitir acceso a login sin autenticación
        if (path === "/login") {
          return true;
        }

        // Para todas las demás rutas, requerir autenticación
        return !!token;
      },
    },
    // Sin esto, withAuth redirige al no autenticado a su pantalla generica
    // /api/auth/signin en vez del /login propio de la app (que si esta
    // declarado en authOptions.pages, pero ese archivo no lo importa este
    // middleware). Hallazgo F-1 de la auditoria de seguridad, 2026-09-17.
    pages: {
      signIn: "/login",
    },
  }
);

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
