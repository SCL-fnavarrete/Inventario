import type { NextConfig } from "next";

const esDesarrollo = process.env.NODE_ENV === "development";

// La CSP (politica de contenido) la pone proxy.ts con un nonce nuevo en cada
// visita: ver lib/seguridad/csp.ts.

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
        destination: "/activos/catalogos?tab=sistemas-operativos",
        permanent: true,
      },
      // Paginas retiradas: Proveedores (SPEC 2.35) y Kit/EPP, que vive en Activos.
      { source: "/configuracion/proveedores", destination: "/configuracion", permanent: true },
      // Importar paso de Activos a Configuracion (SPEC 2.116.7).
      // Toda la importacion es una sola pantalla (SPEC 2.133): las direcciones antiguas llevan a ella.
      { source: "/activos/importar", destination: "/configuracion/importacion", permanent: true },
      { source: "/configuracion/importar", destination: "/configuracion/importacion", permanent: true },
      { source: "/configuracion/importar/lineas", destination: "/configuracion/importacion?que=lineas", permanent: true },
      { source: "/configuracion/importacion/activos", destination: "/configuracion/importacion", permanent: false },
      { source: "/configuracion/importacion/lineas", destination: "/configuracion/importacion?que=lineas", permanent: false },
      { source: "/configuracion/importacion/historial", destination: "/configuracion/importacion?que=historial", permanent: false },
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
    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
