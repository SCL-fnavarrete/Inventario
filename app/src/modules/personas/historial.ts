import { etiquetaEstadoDevolucion } from '@/modules/activos';
import { formatearNumero } from '@/modules/lineas';

/**
 * Historial de asignaciones de una persona (SPEC 2.132): todo lo que se le ha
 * entregado a lo largo del tiempo, en una sola lista: equipos, Kit/EPP y
 * lineas telefonicas, igual que la ficha de un equipo muestra a quien se le
 * entrego. Es solo armado de datos (sin base de datos): las consultas las hace
 * cada modulo dueno y la ruta las junta.
 */

export type TipoItemHistorial = 'equipo' | 'kit' | 'linea';

export type ItemHistorial = {
  clave: string;
  tipo: TipoItemHistorial;
  titulo: string;
  detalle: string | null;
  desde: Date | string | null;
  hasta: Date | string | null;
  estado: string;
  /** Lo tiene ahora (en uso). */
  vigente: boolean;
  enlace: string | null;
};

type Fecha = Date | string | null;

export type EquipoDelHistorial = {
  id: string;
  fechaEntrega: Fecha;
  fechaDevolucion: Fecha;
  estadoDevolucion: string | null;
  activo: boolean;
  asset: { id: string; marca: { nombre: string }; modelo: string; numeroSerie: string | null; imei: string | null; categoria: { nombre: string } };
};

export type KitDelHistorial = {
  id: string;
  cantidad: number;
  fechaEntrega: Fecha;
  estado: string;
  item: { nombre: string; categoria: string };
};

export type TramoDelHistorial = {
  id: string;
  desde: Fecha;
  hasta: Fecha;
  /** Como termino el tramo: lo que paso con la linea despues (null si sigue). */
  cierre: string | null;
  motivo: { nombre: string } | null;
  linea: { id: string; numero: string };
  activo: { marca: { nombre: string }; modelo: string } | null;
};

const ESTADO_KIT: Record<string, string> = {
  entregado: 'Entregado',
  devuelto: 'Devuelto',
  perdido: 'Perdido',
  no_devuelto: 'No devuelto',
};

// Como termino la entrega de un equipo (lo que dice "ok" en la devolucion es que volvio bien).
const ESTADO_EQUIPO_DEVUELTO: Record<string, string> = {
  ok: 'Devuelto',
  danado: 'Devuelto dañado',
  incompleto: 'Devuelto incompleto',
  baja: 'Devuelto y dado de baja',
  no_devuelto: 'No devuelto',
};

const CIERRE_LINEA: Record<string, string> = {
  devolucion_telefono: 'Devuelta (con el teléfono)',
  entrega_telefono: 'Pasó a otra persona',
  reasignacion: 'Reasignada',
};

const tiempo = (f: Fecha) => (f ? new Date(f).getTime() : -Infinity);

/** Junta equipos, Kit/EPP y lineas de una persona, del mas reciente al mas antiguo. */
export function armarHistorialAsignaciones(d: {
  equipos: EquipoDelHistorial[];
  kit: KitDelHistorial[];
  lineas: TramoDelHistorial[];
}): ItemHistorial[] {
  const equipos: ItemHistorial[] = d.equipos.map((e) => ({
    clave: `equipo-${e.id}`,
    tipo: 'equipo',
    titulo: `${e.asset.categoria.nombre} ${e.asset.marca.nombre} ${e.asset.modelo}`,
    detalle: e.asset.numeroSerie ? `N° de serie ${e.asset.numeroSerie}` : e.asset.imei ? `IMEI ${e.asset.imei}` : null,
    desde: e.fechaEntrega,
    hasta: e.fechaDevolucion,
    // "No devuelto" deja la asignacion abierta a proposito: no es un equipo en uso.
    estado: e.estadoDevolucion === 'no_devuelto' ? 'No devuelto' : e.activo ? 'En uso' : e.estadoDevolucion ? (ESTADO_EQUIPO_DEVUELTO[e.estadoDevolucion] ?? etiquetaEstadoDevolucion(e.estadoDevolucion)) : 'Devuelto',
    vigente: e.activo && !e.estadoDevolucion,
    enlace: `/activos/${e.asset.id}`,
  }));
  const kit: ItemHistorial[] = d.kit.map((k) => ({
    clave: `kit-${k.id}`,
    tipo: 'kit',
    titulo: k.cantidad > 1 ? `${k.item.nombre} ×${k.cantidad}` : k.item.nombre,
    detalle: k.item.categoria === 'epp' ? 'EPP' : 'Kit de bienvenida',
    desde: k.fechaEntrega,
    hasta: null,
    estado: ESTADO_KIT[k.estado] ?? k.estado,
    vigente: k.estado === 'entregado',
    enlace: null,
  }));
  const lineas: ItemHistorial[] = d.lineas.map((t) => ({
    clave: `linea-${t.id}`,
    tipo: 'linea',
    titulo: formatearNumero(t.linea.numero),
    detalle: [t.activo ? `En ${t.activo.marca.nombre} ${t.activo.modelo}` : 'Teléfono personal o eSIM', t.motivo?.nombre].filter(Boolean).join(' · '),
    desde: t.desde,
    hasta: t.hasta,
    estado: t.hasta ? (t.cierre ? CIERRE_LINEA[t.cierre] ?? 'Terminó' : 'Terminó') : 'En uso',
    vigente: !t.hasta,
    enlace: `/activos/lineas/${t.linea.id}`,
  }));
  return [...equipos, ...kit, ...lineas].sort((a, b) => tiempo(b.desde) - tiempo(a.desde));
}
