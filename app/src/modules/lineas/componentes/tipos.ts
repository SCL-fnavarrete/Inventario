import type { fichaLinea } from "@/modules/lineas/servicio";

/** Tipos y utilidades que comparten las pantallas de Lineas (SPEC 2.131). */

export type Persona = { id: string; nombres: string; apellidoPaterno: string; rut: string | null; estado?: string };
export type Celular = { id: string; marca: string; modelo: string; imei: string | null; sedeId?: string | null; empleadoActual: Persona | null };
export type Opcion = { id: string; nombre: string };
/** Un tipo de chip dice si va sin celular de la empresa (eSIM / MFF). */
export type TipoChipOpcion = Opcion & { sinCelular: boolean };
export type Plan = Opcion & { precioMensual: number | null };
export type Estado = Opcion & { deBaja: boolean; clave?: string | null };

/** Una linea como la traen la lista y la ficha. */
export type LineaLista = {
  id: string;
  numero: string;
  precioMensual: number | null;
  fechaBaja: Date | string | null;
  responsable: string | null;
  sedeId: string | null;
  sede: Opcion | null;
  observaciones: string | null;
  activo: Celular | null;
  empleado: Persona | null;
  tipoChip: (Opcion & { sinCelular?: boolean }) | null;
  operador: Opcion | null;
  plan: Opcion | null;
  estado: Estado;
};

/** Lo que ofrecen los formularios: celulares (con quien los tiene), personas y catalogos activos. */
export type OpcionesLinea = {
  celulares: Celular[];
  personas: Persona[];
  tiposChip: TipoChipOpcion[];
  planes: Plan[];
  estados: Estado[];
  sedes: Opcion[];
  operadores: Opcion[];
};
export const OPCIONES_VACIAS: OpcionesLinea = { celulares: [], personas: [], tiposChip: [], planes: [], estados: [], sedes: [], operadores: [] };

/** La ficha completa de una linea (pantalla de detalle). */
export type FichaLinea = Awaited<ReturnType<typeof fichaLinea>>;

export const nombrePersona = (p: Persona) => `${p.nombres} ${p.apellidoPaterno}`;
export const nombreCelular = (c: Celular) => `${c.marca} ${c.modelo}${c.imei ? ` · IMEI ${c.imei}` : ""}`;

/** La persona de una linea: la que tiene su celular o, sin celular, la guardada en la linea. */
export const personaDe = (l: Pick<LineaLista, "activo" | "empleado">) => (l.activo ? l.activo.empleadoActual : l.empleado);

/** Como empezo cada tramo de tenencia. */
export const ORIGEN_TENENCIA: Record<string, string> = {
  alta: "Alta de la línea",
  importacion: "Importación",
  reasignacion: "Asignación",
  entrega_telefono: "Se entregó el teléfono",
  devolucion_telefono: "Se devolvió el teléfono",
  termino: "Devolución por término (eSIM liberada)",
};
