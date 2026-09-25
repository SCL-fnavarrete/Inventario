import NextAuth from "next-auth";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { cerrarSesion, datosCliente } from "@/lib/services/accesoService";

// Fix for Next.js 16 + Turbopack: prevent static analysis of dynamic API route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const handler = NextAuth(authOptions);

type Contexto = { params: Promise<{ nextauth: string[] }> };

/**
 * Cierre de sesion (SPEC 2.112.5): antes de que NextAuth borre la cookie,
 * la sesion se anota en la lista negra y queda en el registro de accesos
 * con la direccion de red y el navegador. Nunca impide cerrar sesion.
 */
async function POST(req: NextRequest, ctx: Contexto) {
  if (req.nextUrl.pathname.endsWith("/signout")) {
    try {
      const token = await getToken({ req, secret: authOptions.secret });
      if (token) await cerrarSesion(token, datosCliente(req.headers));
    } catch {
      // El registro no puede impedir salir.
    }
  }
  return handler(req, ctx);
}

export { handler as GET, POST };
