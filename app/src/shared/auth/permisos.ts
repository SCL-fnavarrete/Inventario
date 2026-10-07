// Import de tipo: este modulo lo consume tambien la UI (usePermissions), y
// asi no arrastra el cliente de Prisma al bundle del navegador.
import type { SystemRole } from '@prisma/client';

/**
 * Matriz de permisos — unico punto de verdad de la autorizacion.
 *
 * Solo existen dos roles reales (ver SystemRole en el schema):
 *
 *   | Admin   | Todo, incluida la Configuracion |
 *   | Tecnico | Lo mismo que el admin, salvo la Configuracion (SPEC 2.136): si |
 *   |         | alguien sale de vacaciones, un tecnico gestiona casi todo. |
 *
 * Eliminar tambien lo hace el tecnico; cada servicio exige que lo borrado no
 * tenga nada registrado (para todos los roles) y queda en la auditoria. Lo de
 * Configuracion (usuarios, sedes, categorias, seguridad) es solo del admin.
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
  'lineas',
  'catalogosLineas',
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
    delete: AMBOS,
  },

  empleados: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
  },

  // Entregar y recibir equipos es justamente el trabajo del tecnico.
  asignaciones: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
  },

  solicitudes: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
  },

  mantenciones: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
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
    delete: AMBOS,
  },

  guias: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
  },

  // SPEC 2.111 y 2.134: la compra es de la empresa. Admin y tecnico la
  // registran, agregan lo comprado, lo reparten y eliminan lo agregado por
  // error (SPEC 2.136).
  compras: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
  },

  // Datos maestros: los lee todo el que trabaja con activos, los cambia admin.
  categorias: {
    read: AMBOS,
    write: ADMIN,
    delete: ADMIN,
  },

  // Lineas telefonicas (SPEC 2.131): igual que los activos. Importarlas es
  // de Configuracion (admin), como la importacion de activos.
  lineas: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
  },

  // Planes, estados y tipos de chip de las lineas: los administran todos,
  // como los motivos de baja. Uno ya usado se desactiva.
  catalogosLineas: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
  },

  // Catalogo y stock de Kit de Bienvenida / EPP: a diferencia de
  // Categorias, aca el tecnico si puede escribir -- entrega estos
  // articulos en terreno y necesita ajustar el stock (y borrar lo creado por
  // error, SPEC 2.136).
  kitEpp: {
    read: AMBOS,
    write: AMBOS,
    delete: AMBOS,
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
