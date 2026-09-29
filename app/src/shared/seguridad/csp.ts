import { NextResponse, type NextRequest } from "next/server";

/**
 * Politica de contenido (CSP) con nonce (auditoria 28-sep-2026, 1.3).
 *
 * En cada visita el proxy genera un codigo al azar (nonce) y la politica dice
 * "solo ejecuta scripts que traigan este codigo". Next se lo pone solo a sus
 * scripts; el del tema lo lee el layout (cabecera x-nonce). Un script
 * inyectado no conoce el codigo y el navegador no lo ejecuta. Antes se usaba
 * 'unsafe-inline', que dejaba pasar cualquier script escrito en la pagina.
 *
 * - 'strict-dynamic': los scripts con nonce pueden cargar los suyos (Next).
 * - style 'unsafe-inline': React y los graficos usan estilos en linea; un
 *   estilo no ejecuta codigo, el riesgo es mucho menor.
 * - En desarrollo, 'unsafe-eval' y ws: los necesita la recarga en caliente.
 * Todo lo demas, solo desde el propio sitio: la tipografia la sirve
 * next/font y los PDF se generan en el servidor.
 */
export function construirCsp(nonce: string, esDesarrollo = process.env.NODE_ENV === "development"): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${esDesarrollo ? " ws:" : ""}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** Sigue con la peticion agregando un nonce nuevo y su CSP. */
export function seguirConCsp(req: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = construirCsp(nonce);

  // Next lee la CSP de la peticion para ponerle el nonce a sus scripts.
  const cabeceras = new Headers(req.headers);
  cabeceras.set("x-nonce", nonce);
  cabeceras.set("Content-Security-Policy", csp);

  const respuesta = NextResponse.next({ request: { headers: cabeceras } });
  respuesta.headers.set("Content-Security-Policy", csp);
  return respuesta;
}
