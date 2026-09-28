import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV === "development";

/**
 * Politica de contenido: todo desde el propio sitio. La tipografia la sirve
 * next/font desde el mismo dominio y los PDF se generan en el servidor, asi
 * que no hay origenes externos que permitir.
 * - script 'unsafe-inline': el script del tema (temaInitScript, en el <head>
 *   para evitar el parpadeo) y los datos que Next incrusta en la pagina.
 * - style 'unsafe-inline': estilos en linea de React y de los graficos.
 * - En desarrollo, 'unsafe-eval' y ws: los necesita la recarga en caliente.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${esDesarrollo ? " ws:" : ""}`,
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // "Guias de despacho" se llama "Despachos" desde el 25-sep-2026 (SPEC
  // 2.110): los enlaces guardados a la direccion antigua siguen funcionando.
  async redirects() {
    return [
      { source: "/guias-despacho", destination: "/despachos", permanent: true },
      { source: "/guias-despacho/:path*", destination: "/despachos/:path*", permanent: true },
      // Categorias y Opciones de Activos se unieron en Catalogos de Activos
      // (SPEC 2.112.8).
      { source: "/configuracion/categorias", destination: "/configuracion/catalogos", permanent: true },
      {
        source: "/configuracion/opciones-activos",
        destination: "/configuracion/catalogos?tab=sistemas-operativos",
        permanent: true,
      },
      // Paginas retiradas: Proveedores (SPEC 2.35) y Kit/EPP, que vive en Activos.
      { source: "/configuracion/proveedores", destination: "/configuracion", permanent: true },
      { source: "/configuracion/kit-epp", destination: "/activos/kit-bienvenida", permanent: true },
    ];
  },
  // No anunciar el framework en cada respuesta (auditoria 27-sep-2026, 2.7).
  poweredByHeader: false,
  // Cabeceras de seguridad (auditoria 27-sep-2026, 2.7). Ya no hay bloque
  // CORS para /api: la app solo se llama a si misma (mismo origen), y abrir
  // la API a otro origen con credenciales no aportaba nada.
  async headers() {
    const headers = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      // 0 es lo recomendado hoy: el filtro XSS antiguo de los navegadores
      // abria sus propios problemas. La proteccion real es la CSP.
      { key: "X-XSS-Protection", value: "0" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (!esDesarrollo) {
      // Solo sobre HTTPS: en localhost no aplica.
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [
      { source: "/:path*", headers },
      // La CSP va solo en las paginas: la API responde JSON y PDF, y una CSP
      // con object-src 'none' sobre un PDF bloquea el visor del navegador.
      {
        source: "/((?!api/).*)",
        headers: [{ key: "Content-Security-Policy", value: CSP }],
      },
    ];
  },
};

export default nextConfig;
