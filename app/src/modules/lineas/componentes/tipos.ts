import type { fichaLinea } from "@/modules/lineas/servicio";

/** Tipos y utilidades que comparten las pantallas de Lineas (SPEC 2.131). */

export type Persona = { id: string; nombres: string; apellidoPaterno: string; rut: string | null; estado?: string; sede?: { nombre: string } | null };
export type Celular = { id: string; marca: { nombre: string }; modelo: string; imei: string | null; sede?: { nombre: string } | null; empleadoActual: Persona | null };
export type Opcion = { id: string; nombre: string };
/** Un tipo de chip dice si va sin celular de la empresa (eSIM / MFF). */
export type TipoChipOpcion = Opcion & { sinCelular: boolean };
export type Estado = Opcion & { deBaja: boolean; clave?: string | null };

/** Una linea como la traen la lista y la ficha. */
export type LineaLista = {
  id: string;
  numero: string;
  fechaBaja: Date | string | null;
  observaciones: string | null;
  activo: Celular | null;
  empleado: Persona | null;
  // Sede donde se guarda el chip mientras esta disponible (SPEC 2.165).
  sede?: { nombre: string } | null;
  tipoChip: (Opcion & { sinCelular?: boolean }) | null;
  operador: Opcion | null;
  estado: Estado;
};

/** Lo que ofrecen los formularios: celulares (con quien los tiene), personas y catalogos activos. */
export type OpcionesLinea = {
  celulares: Celular[];
  personas: Persona[];
  tiposChip: TipoChipOpcion[];
  estados: Estado[];
  operadores: Opcion[];
  sedes: Opcion[];
};
export const OPCIONES_VACIAS: OpcionesLinea = { celulares: [], personas: [], tiposChip: [], estados: [], operadores: [], sedes: [] };

/** La ficha completa de una linea (pantalla de detalle). */
export type FichaLinea = Awaited<ReturnType<typeof fichaLinea>>;

export const nombrePersona = (p: Persona) => `${p.nombres} ${p.apellidoPaterno}`;
/** Celular en un selector: con su IMEI (para buscarlo) y quien lo tiene, si alguien. */
export const nombreCelular = (c: Celular) =>
  `${c.marca.nombre} ${c.modelo}${c.imei ? ` · IMEI ${c.imei}` : ""}${c.empleadoActual ? ` · lo tiene ${nombrePersona(c.empleadoActual)}` : ""}`;

/** La persona de una linea: la que tiene su celular o, sin celular, la guardada en la linea. */
export const personaDe = (l: Pick<LineaLista, "activo" | "empleado">) => (l.activo ? l.activo.empleadoActual : l.empleado);

/**
 * Sede de una linea: la de su celular; sin celular, la de su persona; disponible,
 * la sede donde se guarda el chip (SPEC 2.165).
 */
export const sedeDe = (l: Pick<LineaLista, "activo" | "empleado" | "sede">) =>
  (l.activo ? l.activo.sede : l.empleado ? l.empleado.sede : l.sede)?.nombre ?? null;

/** Como empezo cada tramo de tenencia. */
export const ORIGEN_TENENCIA: Record<string, string> = {
  alta: "Alta de la línea",
  importacion: "Importación",
  reasignacion: "Asignación",
  entrega_telefono: "Se entregó el teléfono",
  devolucion_telefono: "Se devolvió el teléfono",
  termino: "Devolución por término (eSIM liberada)",
};
