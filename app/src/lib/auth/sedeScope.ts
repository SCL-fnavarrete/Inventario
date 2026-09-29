import { ValidationError } from '@/lib/errors';

/**
 * Sedes (SPEC 2.117): la sede es un dato -- donde esta cada cosa y de donde
 * es cada usuario --, no un candado. Todos los usuarios ven y trabajan con
 * todas las sedes; asi un tecnico cubre la sede de otro que no esta. Lo que
 * solo puede el admin lo decide el rol (permissions.ts), no la sede.
 */

/** Filtro opcional por la sede elegida en el navbar (o `?sedeId=`). */
export function filtroSede(sedeId?: string | null): { sedeId?: string } {
  return sedeId ? { sedeId } : {};
}

/** Sede de un registro nuevo: la elegida en el formulario, obligatoria donde se pide. */
export function sedeIdParaCrear(sedeId?: string | null, opts?: { requerido?: boolean }): string | null {
  if (opts?.requerido && !sedeId) throw new ValidationError('Debes seleccionar una sede.');
  return sedeId || null;
}
