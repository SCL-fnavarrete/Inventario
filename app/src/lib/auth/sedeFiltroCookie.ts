import { cookies } from 'next/headers';
import { SEDE_COOKIE } from '@/lib/constants/sede';

/**
 * Sede elegida en el selector del navbar, para server components (no tienen
 * acceso al contexto de SedeSeleccionadaProvider). Es solo un filtro de
 * presentacion: combinarla siempre con sedeWhereConFiltro, que la ignora
 * para quien no ve todas las sedes. Leer la cookie ademas hace que Next
 * re-renderice la pagina al cambiarla, en vez de servir una version cacheada.
 */
export async function leerSedeFiltroDesdeCookie(): Promise<string | null> {
  return (await cookies()).get(SEDE_COOKIE)?.value || null;
}
