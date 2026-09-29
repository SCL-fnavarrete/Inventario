import type { ResultadoAcceso } from "@prisma/client";

/** Nombre y color de cada resultado del Registro de accesos (SPEC 2.112). */
export const RESULTADO_ACCESO_LABEL: Record<ResultadoAcceso, string> = {
  exito: "Ingresó",
  clave_incorrecta: "Contraseña incorrecta",
  usuario_inexistente: "Usuario no existe",
  usuario_inactivo: "Usuario desactivado",
  bloqueado: "Bloqueado por intentos",
  cierre_sesion: "Cerró sesión",
  sesion_revocada: "Sesión cortada",
  sede_inactiva: "Sede desactivada",
};

export const RESULTADO_ACCESO_BADGE: Record<ResultadoAcceso, string> = {
  exito: "bg-emerald-50 text-emerald-800 border-emerald-200",
  clave_incorrecta: "bg-amber-50 text-amber-800 border-amber-200",
  usuario_inexistente: "bg-orange-50 text-orange-800 border-orange-200",
  usuario_inactivo: "bg-red-50 text-red-800 border-red-200",
  bloqueado: "bg-red-50 text-red-800 border-red-200",
  cierre_sesion: "bg-gray-100 text-fg-muted border-line",
  sesion_revocada: "bg-purple-50 text-purple-800 border-purple-200",
  sede_inactiva: "bg-red-50 text-red-800 border-red-200",
};

/**
 * Direccion de red en palabras: la del propio servidor (pruebas en local)
 * como "Este equipo (local)", y la IPv4 escrita como IPv6 (::ffff:1.2.3.4)
 * como IPv4.
 */
export function ipLegible(ip: string | null | undefined): string {
  if (!ip) return "-";
  if (ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1") return "Este equipo (local)";
  return ip.replace(/^::ffff:/, "");
}

/**
 * Navegador y sistema en palabras, a partir del texto que envia el
 * navegador ("Mozilla/5.0 (Windows NT 10.0...) ... Edg/140"). El texto
 * completo queda al pasar el mouse.
 */
export function navegadorLegible(ua: string | null | undefined): string {
  if (!ua) return "-";
  const nav = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Otro navegador";
  const so = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iPhone/iPad"
        : /Mac OS/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return so ? `${nav} en ${so}` : nav;
}
