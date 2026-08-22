// Import de tipo: este modulo lo consume tambien la UI (usePermissions), y
// asi no arrastra el cliente de Prisma al bundle del navegador.
import type { SystemRole } from '@prisma/client';

/**
 * Matriz de permisos — unico punto de verdad de la autorizacion.
 *
 * Derivada de la tabla de roles del SPEC seccion 1.3:
 *
 *   | Admin IT   | CRUD completo, reportes, configuracion                       |
 *   | Tecnico IT | Asignar/recibir equipos, registrar mantenciones               |
 *   | Supervisor | Ver reportes de su area, aprobar solicitudes                  |
 *   | RRHH       | Solo lectura de fichas de empleados y estados de devolucion   |
 *   | Auditor    | Solo lectura de todo el sistema                               |
 *
 * Regla base: `auditor` y `rrhh` no escriben en ningun recurso. La unica
 * excepcion es la confirmacion de RRHH dentro del workflow de solicitudes,
 * que no es un permiso de recurso sino de estado y vive en
 * `puedeConfirmarComoRrhh()`, mas abajo.
 *
 * Antes de este archivo cada ruta decidia por su cuenta y 55 de 63 no decidian
 * nada. Cualquier cambio de permisos se hace aqui y en el SPEC, nunca en una
 * ruta suelta.
 */

export const RECURSOS = [
  'activos',
  'empleados',
  'asignaciones',
  'solicitudes',
  'mantenciones',
  'desvinculaciones',
  'guias',
  'compras',
  'proveedores',
  'categorias',
  'usuarios',
  'reportes',
  'configuracion',
] as const;

export type Recurso = (typeof RECURSOS)[number];

export const ACCIONES = ['read', 'write', 'delete'] as const;
export type Accion = (typeof ACCIONES)[number];

const ADMIN: readonly SystemRole[] = ['admin'];
const SOLO_LECTURA: readonly SystemRole[] = [];

export const RESOURCE_PERMISSIONS: Record<Recurso, Record<Accion, readonly SystemRole[]>> = {
  // El parque de equipos. RRHH lo lee porque la ficha del empleado muestra
  // que tiene asignado; no lo modifica.
  activos: {
    read: ['admin', 'tecnico', 'supervisor', 'rrhh', 'auditor'],
    write: ['admin', 'tecnico'],
    delete: ADMIN,
  },

  empleados: {
    read: ['admin', 'tecnico', 'supervisor', 'rrhh', 'auditor'],
    write: ['admin', 'tecnico'],
    delete: ADMIN,
  },

  // Entregar y recibir equipos es justamente el trabajo del tecnico.
  asignaciones: {
    read: ['admin', 'tecnico', 'supervisor', 'rrhh', 'auditor'],
    write: ['admin', 'tecnico'],
    delete: ADMIN,
  },

  // El supervisor escribe porque el SPEC le asigna aprobar solicitudes.
  solicitudes: {
    read: ['admin', 'tecnico', 'supervisor', 'rrhh', 'auditor'],
    write: ['admin', 'tecnico', 'supervisor'],
    delete: ADMIN,
  },

  mantenciones: {
    read: ['admin', 'tecnico', 'supervisor', 'auditor'],
    write: ['admin', 'tecnico'],
    delete: ADMIN,
  },

  // RRHH lee: el SPEC le da acceso a los estados de devolucion.
  desvinculaciones: {
    read: ['admin', 'tecnico', 'supervisor', 'rrhh', 'auditor'],
    write: ['admin', 'tecnico'],
    delete: ADMIN,
  },

  guias: {
    read: ['admin', 'tecnico', 'supervisor', 'auditor'],
    write: ['admin', 'tecnico'],
    delete: ADMIN,
  },

  // Informacion financiera: fuera del alcance operativo del tecnico.
  compras: {
    read: ['admin', 'supervisor', 'auditor'],
    write: ADMIN,
    delete: ADMIN,
  },

  proveedores: {
    read: ['admin', 'tecnico', 'supervisor', 'auditor'],
    write: ADMIN,
    delete: ADMIN,
  },

  // Datos maestros: los lee todo el que trabaja con activos, los cambia admin.
  categorias: {
    read: ['admin', 'tecnico', 'supervisor', 'auditor'],
    write: ADMIN,
    delete: ADMIN,
  },

  usuarios: {
    read: ADMIN,
    write: ADMIN,
    delete: ADMIN,
  },

  // Nadie "escribe" un reporte: se generan a partir de los datos.
  reportes: {
    read: ['admin', 'tecnico', 'supervisor', 'rrhh', 'auditor'],
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
 * puede ejecutar cada transicion, esta cubierto al 100% por tests y es lo que
 * el SPEC seccion 2.5 describe. Duplicar esa regla en la matriz crearia dos
 * fuentes de verdad para lo mismo, que es justo lo que esta ola elimina.
 *
 * Por eso la ruta de transicion exige `solicitudes/read` (que la persona pueda
 * ver la solicitud) y delega la decision real en la maquina de estados. Es
 * tambien la razon por la que `rrhh` no tiene `write` en `solicitudes`: sus
 * unicas escrituras son las transiciones de confirmacion, y esas las concede
 * la maquina de estados, no la matriz.
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
