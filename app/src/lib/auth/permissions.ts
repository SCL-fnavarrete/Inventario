// Import de tipo: este modulo lo consume tambien la UI (usePermissions), y
// asi no arrastra el cliente de Prisma al bundle del navegador.
import type { SystemRole } from '@prisma/client';

/**
 * Matriz de permisos — unico punto de verdad de la autorizacion.
 *
 * Solo existen dos roles reales (ver SystemRole en el schema):
 *
 *   | Admin   | CRUD completo, reportes, configuracion, ve todas las sedes |
 *   | Tecnico | Trabajo operativo de soporte (activos, empleados, solicitudes,
 *   |         | mantenciones, guias), restringido a su propia sede (ver
 *   |         | sedeScope()) |
 *
 * Cualquier cambio de permisos se hace aqui, nunca en una ruta suelta.
 */

export const RECURSOS = [
  'activos',
  'empleados',
  'asignaciones',
  'solicitudes',
  'mantenciones',
  'tiposMantencion',
  'desvinculaciones',
  'guias',
  'compras',
  'categorias',
  'kitEpp',
  'usuarios',
  'sedes',
  'reportes',
  'configuracion',
] as const;

export type Recurso = (typeof RECURSOS)[number];

export const ACCIONES = ['read', 'write', 'delete'] as const;
export type Accion = (typeof ACCIONES)[number];

const ADMIN: readonly SystemRole[] = ['admin'];
const AMBOS: readonly SystemRole[] = ['admin', 'tecnico'];
const SOLO_LECTURA: readonly SystemRole[] = [];

export const RESOURCE_PERMISSIONS: Record<Recurso, Record<Accion, readonly SystemRole[]>> = {
  activos: {
    read: AMBOS,
    write: AMBOS,
    delete: ADMIN,
  },

  empleados: {
    read: AMBOS,
    write: AMBOS,
    delete: ADMIN,
  },

  // Entregar y recibir equipos es justamente el trabajo del tecnico.
  asignaciones: {
    read: AMBOS,
    write: AMBOS,
    delete: ADMIN,
  },

  solicitudes: {
    read: AMBOS,
    write: AMBOS,
    delete: ADMIN,
  },

  mantenciones: {
    read: AMBOS,
    write: AMBOS,
    delete: ADMIN,
  },

  // Catalogo de tipos de mantencion: a diferencia de Categorias/
  // Configuracion, es una decision operativa del dia a dia, asi que el
  // tecnico tambien puede crear/editar/eliminar tipos sin pasar por
  // Configuracion (admin-only).
  tiposMantencion: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
  },

  desvinculaciones: {
    read: AMBOS,
    write: AMBOS,
    delete: ADMIN,
  },

  guias: {
    read: AMBOS,
    write: AMBOS,
    delete: ADMIN,
  },

  // SPEC 2.111: la compra es de la empresa. El admin la registra y decide a
  // que sede se reparte lo comprado; el tecnico ve todas las compras y lo
  // que hay por repartir, en solo lectura.
  compras: {
    read: AMBOS,
    write: ADMIN,
    delete: ADMIN,
  },

  // Datos maestros: los lee todo el que trabaja con activos, los cambia admin.
  categorias: {
    read: AMBOS,
    write: ADMIN,
    delete: ADMIN,
  },

  // Catalogo y stock de Kit de Bienvenida / EPP: a diferencia de
  // Categorias, aca el tecnico si puede escribir -- entrega estos
  // articulos en terreno y necesita ajustar el stock de su propia sede
  // (ver sedeScope en las rutas de /api/kit-items). Eliminar del catalogo
  // queda solo para admin.
  kitEpp: {
    read: AMBOS,
    write: AMBOS,
    delete: ADMIN,
  },

  usuarios: {
    read: ADMIN,
    write: ADMIN,
    delete: ADMIN,
  },

  // Datos maestros de sedes. Tecnico necesita leer la lista (ej. para
  // mostrar el nombre de su sede); solo admin crea/edita/desactiva sedes,
  // ya que definen el aislamiento de datos.
  sedes: {
    read: AMBOS,
    write: ADMIN,
    delete: ADMIN,
  },

  // Dashboard (KPIs, alertas, graficos). Conserva el nombre "reportes"
  // aunque el modulo Reportes se elimino (SPEC 2.79). Solo lectura.
  reportes: {
    read: AMBOS,
    write: SOLO_LECTURA,
    delete: SOLO_LECTURA,
  },

  // Parametros, sincronizacion Microsoft y utilidades de mantenimiento de la
  // base (incluido el borrado masivo). Solo admin.
  configuracion: {
    read: ADMIN,
    write: ADMIN,
    delete: ADMIN,
  },
};

/**
 * Las transiciones del workflow NO se autorizan aqui.
 *
 * `workflowStateMachine.canTransition(tipo, from, to, rol)` ya define que rol
 * puede ejecutar cada transicion, cubierto por tests. Duplicar esa regla en
 * la matriz crearia dos fuentes de verdad para lo mismo.
 *
 * Por eso la ruta de transicion exige `solicitudes/read` (que la persona pueda
 * ver la solicitud) y delega la decision real en la maquina de estados.
 */

/** ¿Puede este rol ejecutar esta accion sobre este recurso? */
export function can(rol: SystemRole | string | undefined | null, recurso: Recurso, accion: Accion): boolean {
  if (!rol) return false;
  const permitidos = RESOURCE_PERMISSIONS[recurso]?.[accion];
  if (!permitidos) return false;
  return permitidos.includes(rol as SystemRole);
}

/** Roles que pueden ejecutar la accion. Util para la UI y para los tests. */
export function rolesQuePueden(recurso: Recurso, accion: Accion): readonly SystemRole[] {
  return RESOURCE_PERMISSIONS[recurso][accion];
}

/** Todos los recursos sobre los que el rol puede ejecutar la accion. */
export function recursosPermitidos(
  rol: SystemRole | string | undefined | null,
  accion: Accion
): Recurso[] {
  return RECURSOS.filter((recurso) => can(rol, recurso, accion));
}
