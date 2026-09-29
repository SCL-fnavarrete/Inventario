import { inputFechaHoraAISO } from "@/shared/utilidades/fechas";

/**
 * Coordinacion de una entrega, un cambio o una devolucion en Nueva Solicitud
 * (auditoria 28-sep-2026, 3.6). Antes eran 5 estados sueltos por tipo (15 en
 * total) y el mismo formulario copiado tres veces; ahora es un objeto por
 * tipo y un componente (SeccionCoordinacion).
 */
export type Medio = "presencial" | "chilexpress";

export type Coordinacion = {
  /** Fecha y hora, tal como la entrega un <input type="datetime-local">. */
  fecha: string;
  medio: Medio;
  lugar: string;
  ot: string;
  ciudad: string;
};

export const COORDINACION_VACIA: Coordinacion = { fecha: "", medio: "presencial", lugar: "", ot: "", ciudad: "" };

/**
 * Nombre de cada dato al enviarlo al servidor, que es tambien la clave de su
 * error en el formulario. No cambian: son los del esquema de la API.
 */
export const CLAVES = {
  entrega: {
    fecha: "fechaEntregaCoordinada",
    medio: "medioEntrega",
    lugar: "lugarEntrega",
    ot: "otChilexpressEntrega",
    ciudad: "ciudadEntrega",
  },
  cambio: {
    fecha: "fechaCambioCoordinada",
    medio: "medioCambio",
    lugar: "lugarCambio",
    ot: "otCambioChilexpress",
    ciudad: "ciudadCambio",
  },
  devolucion: {
    fecha: "fechaDevolucionCoordinada",
    medio: "medioDevolucion",
    lugar: "lugarDevolucion",
    ot: "otChilexpress",
    ciudad: "ciudadDevolucion",
  },
} as const;

export type ClavesCoordinacion = (typeof CLAVES)[keyof typeof CLAVES];

/** Presencial pide fecha y lugar; Chilexpress, fecha, OT y destino. */
export function erroresCoordinacion(
  c: Coordinacion,
  claves: ClavesCoordinacion,
  mensaje: string
): Record<string, string> {
  const errores: Record<string, string> = {};
  if (!c.fecha) errores[claves.fecha] = mensaje;
  if (c.medio === "presencial") {
    if (!c.lugar.trim()) errores[claves.lugar] = mensaje;
  } else {
    if (!c.ot.trim()) errores[claves.ot] = mensaje;
    if (!c.ciudad.trim()) errores[claves.ciudad] = mensaje;
  }
  return errores;
}

/** Datos para el servidor: solo los del medio elegido. */
export function cuerpoCoordinacion(c: Coordinacion, claves: ClavesCoordinacion) {
  const presencial = c.medio === "presencial";
  return {
    [claves.fecha]: inputFechaHoraAISO(c.fecha),
    [claves.medio]: c.medio,
    [claves.lugar]: presencial ? c.lugar || undefined : undefined,
    [claves.ot]: presencial ? undefined : c.ot || undefined,
    [claves.ciudad]: presencial ? undefined : c.ciudad || undefined,
  };
}
