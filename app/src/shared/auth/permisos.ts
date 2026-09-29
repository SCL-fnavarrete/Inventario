// Import de tipo: este modulo lo consume tambien la UI (usePermissions), y
// asi no arrastra el cliente de Prisma al bundle del navegador.
import type { SystemRole } from '@prisma/client';

/**
 * Matriz de permisos — unico punto de verdad de la autorizacion.
 *
 * Solo existen dos roles reales (ver SystemRole en el schema):
 *
 *   | Admin   | CRUD completo, reportes, configuracion |
 *   | Tecnico | Trabajo operativo de soporte (activos, empleados, solicitudes,
 *   |         | mantenciones, guias), en todas las sedes (SPEC 2.117) |
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
  'motivosBaja',
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

  // Motivos de baja (SPEC 2.116.5): catalogo de Mantenciones igual que los
  // tipos, lo administran admin y tecnico. Uno ya usado se desactiva.
  motivosBaja: {
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
  // articulos en terreno y necesita ajustar el stock. Eliminar del catalogo
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
  // elegir la sede en los formularios); solo admin crea/edita/desactiva sedes.
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

  // Seguridad (duracion de sesion, intentos de inicio de sesion) y
  // Auditoria (SPEC 2.112). Solo admin.
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
 * Por eso la ruta de transicion exige solo `solicitudes/write` (mover una
 * solicitud es escribirla) y delega en la maquina de estados que rol puede
 * hacer cada paso.
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
