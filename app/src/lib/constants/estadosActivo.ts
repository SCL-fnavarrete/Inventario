import type { CondicionActivo, EstadoActivo } from '@prisma/client';
import { COLOR_MARCA } from './coloresGraficos';
import type { MotivoBaja } from '@/lib/validations/assetTransition';

/**
 * Presentacion de los estados y condiciones del activo -- unico punto de
 * verdad. Antes cada pantalla tenia su copia y ya se habian separado (En
 * Mantencion salia amarillo en Activos y naranjo en Reportes). Tipado
 * contra los enums de Prisma: un estado nuevo sin etiqueta es error de
 * compilacion, no una celda en blanco.
 */

export const ESTADO_ACTIVO_LABEL: Record<EstadoActivo, string> = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  en_mantencion: 'En Mantención',
  no_devuelto: 'No devuelto',
  baja: 'Baja',
  vendido: 'Vendido',
  en_transito: 'En tránsito',
};

/** Clases de badge (fondo + texto + borde) por estado. */
export const ESTADO_ACTIVO_BADGE: Record<EstadoActivo, string> = {
  disponible: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  asignado: 'bg-primary-50 text-primary-800 border-primary-200',
  en_mantencion: 'bg-amber-50 text-amber-800 border-amber-200',
  no_devuelto: 'bg-orange-50 text-orange-800 border-orange-200',
  baja: 'bg-red-50 text-red-800 border-red-200',
  vendido: 'bg-gray-100 text-fg-muted border-line',
  en_transito: 'bg-sky-50 text-sky-800 border-sky-200',
};

/**
 * Color por estado para graficos. Recharts pinta SVG y necesita el valor
 * literal, no una clase; son los mismos tonos que ESTADO_ACTIVO_BADGE
 * (asignado = COLOR_MARCA.primario).
 */
export const ESTADO_ACTIVO_COLOR: Record<EstadoActivo, string> = {
  disponible: '#10b981',
  asignado: COLOR_MARCA.primario,
  en_mantencion: '#f59e0b',
  no_devuelto: '#ea580c',
  baja: '#ef4444',
  vendido: '#6b7280',
  en_transito: '#0ea5e9',
};

export const CONDICION_ACTIVO_LABEL: Record<CondicionActivo, string> = {
  nuevo: 'Nuevo',
  usado: 'Usado',
  danado: 'Dañado',
};

export const CONDICION_ACTIVO_BADGE: Record<CondicionActivo, string> = {
  nuevo: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  usado: 'bg-amber-50 text-amber-800 border-amber-200',
  danado: 'bg-red-50 text-red-800 border-red-200',
};

/**
 * Estado en que vuelve un equipo (Assignment.estadoDevolucion y las
 * devoluciones de solicitudes). Para el historial y las pantallas: nunca se
 * muestra el valor interno ("danado", "no_devuelto").
 */
export const ESTADO_DEVOLUCION_LABEL: Record<string, string> = {
  ok: 'Buen estado',
  danado: 'Dañado',
  incompleto: 'Incompleto',
  no_devuelto: 'No devuelto',
};

export function etiquetaEstadoDevolucion(estado: string): string {
  return ESTADO_DEVOLUCION_LABEL[estado] ?? estado;
}

/** Motivo de baja de un activo (motivoBajaEnum), para el historial y la UI. */
export const MOTIVO_BAJA_LABEL: Record<MotivoBaja, string> = {
  obsolescencia: 'Obsolescencia',
  falla_irreparable: 'Falla irreparable',
  robo: 'Robo',
  extravio: 'Extravío',
  otro: 'Otro',
};

export function etiquetaMotivoBaja(motivo: string): string {
  return MOTIVO_BAJA_LABEL[motivo as MotivoBaja] ?? motivo;
}

/**
 * Por que un equipo no se puede dar de baja, o null si se puede (SPEC 2.88,
 * 2.106). La regla: solo un equipo sin empleado asignado. Se mira el
 * empleado, no solo el estado: un equipo en mantencion puede seguir asignado
 * a su dueño (se repara y vuelve a el), y uno devuelto dañado queda en
 * mantencion sin dueño y si se puede dar de baja. Unico punto de verdad: la
 * usan las dos rutas que dan de baja (/baja y completar "Sin reparación") y
 * los botones de la interfaz, que avisan antes.
 */
export function motivoSinBaja(activo: {
  estado: string;
  empleadoActualId: string | null;
}): string | null {
  const { estado } = activo;
  if (estado === 'en_mantencion' && activo.empleadoActualId) {
    return 'Está asignado a un empleado: complétalo como "Reparado, vuelve a uso" o devuélvelo con una solicitud antes de darlo de baja.';
  }
  switch (estado) {
    case 'disponible':
    case 'en_mantencion':
      return null;
    case 'asignado':
      return 'Está asignado: primero devuélvelo con una solicitud de desvinculación o cambio de equipo.';
    case 'no_devuelto':
      return 'No fue devuelto: primero recupéralo con una solicitud de desvinculación.';
    case 'baja':
      return 'Ya está dado de baja.';
    case 'vendido':
      return 'Ya fue vendido.';
    case 'en_transito':
      return 'Está en tránsito en una guía de despacho: si se perdió, márcalo en la guía.';
    default:
      return `No se puede dar de baja en estado "${etiquetaEstadoActivo(estado)}".`;
  }
}

/**
 * Por que un equipo no puede recibir una mantencion, o null si puede (SPEC
 * 2.96). Sirve para programarla y para iniciarla: un equipo que no esta en
 * poder de la empresa (no devuelto) o que ya salio del inventario (baja,
 * vendido) no se mantiene. La usan la API y la pantalla Programar.
 */
export function motivoSinMantencion(estado: string): string | null {
  switch (estado) {
    case 'disponible':
    case 'asignado':
    case 'en_mantencion':
      return null;
    case 'no_devuelto':
      return 'No fue devuelto: primero recupéralo con una solicitud de desvinculación.';
    case 'baja':
      return 'Está dado de baja.';
    case 'vendido':
      return 'Fue vendido.';
    case 'en_transito':
      return 'Está en tránsito en una guía de despacho: espera a que llegue.';
    default:
      return `No admite mantenciones en estado "${etiquetaEstadoActivo(estado)}".`;
  }
}

/** Estado al que vuelve un equipo que sale de mantencion (SPEC 2.96). */
export function estadoTrasMantencion(asset: { empleadoActualId: string | null }): EstadoActivo {
  return asset.empleadoActualId ? 'asignado' : 'disponible';
}

/** Etiqueta de una condicion que puede venir como texto libre. */
export function etiquetaCondicionActivo(condicion: string): string {
  return CONDICION_ACTIVO_LABEL[condicion as CondicionActivo] ?? condicion;
}

/** Etiqueta de un estado que puede venir como texto libre (URL, Excel). */
export function etiquetaEstadoActivo(estado: string): string {
  return ESTADO_ACTIVO_LABEL[estado as EstadoActivo] ?? estado;
}
