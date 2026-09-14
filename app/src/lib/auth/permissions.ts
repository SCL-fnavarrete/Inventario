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
 * supervisor/rrhh/auditor existieron en una version anterior del sistema
 * pero no se usaban en la practica (era solo Soporte + Admin) -- se
 * retiraron del enum SystemRole para no mantener una matriz mas compleja
 * de lo que el sistema real necesita.
 *
 * Antes de este archivo cada ruta decidia por su cuenta y 55 de 63 no decidian
 * nada. Cualquier cambio de permisos se hace aqui y en el SPEC, nunca en una
 * ruta suelta.
 */

// 'proveedores' se elimino de este listado el 14-sep-2026 (pedido explicito
// de Javier: "elimina la tabla de proveedores", tabla sin uso). Ver
// schema.prisma (nota en el lugar donde vivia el modelo Supplier) y SPEC 2.35.
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

  // Catalogo de tipos de mantencion (9-sep-2026): a diferencia de
  // Categorias/Configuracion, esto es una decision operativa del dia a
  // dia (que tipos de mantencion se usan), no algo "fijo del sistema" --
  // Javier pidio explicitamente que el tecnico tambien pueda
  // crear/editar/eliminar tipos, sin pasar por Configuracion (admin-only).
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

  // Registrar una compra es trabajo operativo del tecnico (11-sep-2026,
  // pedido explicito de Javier): llega un despacho de otra sede y necesita
  // quedar registrado con que factura vino y para que activos, igual que
  // cualquier otro modulo scopeado por sede. Mismo dia, Javier pidio ademas
  // simplificar el dato en si: se eliminaron proveedor y todo campo
  // financiero (monto, moneda, metodo de pago, precio unitario) del modelo
  // completo -- "el tema del dinero no es un dato que nos interese". Ya no
  // hay nada que la UI/API tengan que filtrar por rol dentro del recurso;
  // compras es simplemente RW para tecnico. Borrar una compra queda
  // reservado a admin.
  compras: {
    read: AMBOS,
    write: AMBOS,
    delete: ADMIN,
  },

  // Datos maestros: los lee todo el que trabaja con activos, los cambia admin.
  categorias: {
    read: AMBOS,
    write: ADMIN,
    delete: ADMIN,
  },

  // Catalogo y stock de Kit de Bienvenida / EPP (SPEC 2.9): a diferencia de
  // Categorias, aca el tecnico si puede escribir -- es el que entrega estos
  // articulos en terreno y necesita poder ajustar el stock de su propia
  // sede (ver sedeScope en las rutas de /api/kit-items). Eliminar un
  // articulo del catalogo si queda solo para admin.
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

  // Datos maestros de sedes (SPEC 2.9). Tecnico necesita leer la lista (ej.
  // para mostrar el nombre de su sede); solo admin crea/edita/desactiva
  // sedes -- es lo que define el aislamiento de datos, asi que no puede
  // quedar en manos de soporte.
  sedes: {
    read: AMBOS,
    write: ADMIN,
    delete: ADMIN,
  },

  // Nadie "escribe" un reporte: se generan a partir de los datos.
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
 * puede ejecutar cada transicion, esta cubierto al 100% por tests y es lo que
 * el SPEC seccion 2.5 describe. Duplicar esa regla en la matriz crearia dos
 * fuentes de verdad para lo mismo, que es justo lo que esta ola elimina.
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
