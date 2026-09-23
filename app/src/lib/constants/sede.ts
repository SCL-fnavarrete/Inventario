/**
 * Cookie con la sede elegida en el selector del navbar. La escribe
 * SedeSeleccionadaProvider (cliente) y la leen los server components via
 * leerSedeFiltroDesdeCookie (lib/auth/sedeFiltroCookie.ts). Vive aparte
 * porque ese helper importa next/headers, que no puede llegar al cliente.
 */
export const SEDE_COOKIE = 'inventario-sede-seleccionada';
