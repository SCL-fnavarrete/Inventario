import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ESTADO_ACTIVO_LABEL, CONDICION_ACTIVO_LABEL, etiquetaEstadoDevolucion } from '@/lib/constants/estadosActivo';
import { ESTADO_GUIA_LABELS } from '@/types/guia-despacho';
import { STATE_LABELS } from '@/lib/services/workflowStateMachine';
import { MODULOS_AUDITORIA } from '@/lib/constants/auditoria';

/**
 * Configuracion > Auditoria (SPEC 2.112.8): junta los tres historiales
 * (AuditLog, AssetHistory y WorkflowTransition) en UNA consulta de la base
 * con UNION ALL, ordenada y paginada ahi mismo. Antes se traian las ultimas
 * 300 filas de cada uno y se mezclaban en memoria: el total no era real, los
 * eventos antiguos no se veian y salia siempre el aviso "Hay mas eventos".
 */

/** Accion en palabras: la de AuditLog, el tipo de evento del activo o el cambio de estado de la solicitud. */
const ACCION_LABEL: Record<string, string> = {
  crear: 'Creó',
  actualizar: 'Editó',
  eliminar: 'Eliminó',
  creacion: 'Alta',
  asignacion: 'Asignación',
  devolucion: 'Devolución',
  mantencion: 'Mantención',
  cambio_estado: 'Cambio de estado',
  actualizacion_specs: 'Edición de datos',
  baja: 'Baja',
  venta: 'Venta',
  solicitud_workflow: 'Solicitud',
  traslado: 'Traslado',
  compra: 'Compra',
};

export type FiltrosAuditoria = {
  modulo?: string;
  usuario?: string;
  search?: string;
  rango?: { gte?: Date; lt?: Date };
  page: number;
  limit: number;
};

type FilaAuditoria = {
  fuente: 'auditlog' | 'asset_history' | 'workflow_transition';
  id: string;
  modulo: string;
  entidad_id: string;
  accion: string;
  descripcion: string;
  usuario_email: string | null;
  usuario_nombre: string | null;
  datos_anteriores: unknown;
  datos_nuevos: unknown;
  created_at: Date;
  contexto: string | null;
};

// Los tres historiales con las mismas columnas. El nombre del usuario sale
// de system_users (AuditLog y AssetHistory guardan el correo).
const EVENTOS = Prisma.sql`
  SELECT 'auditlog' AS fuente, a.id, a.entidad::text AS modulo, a.entidad_id, a.accion::text AS accion,
         a.descripcion, a.usuario_sistema AS usuario_email, u.nombre AS usuario_nombre,
         a.datos_anteriores, a.datos_nuevos, a.created_at, NULL::text AS contexto
  FROM audit_log a LEFT JOIN system_users u ON u.email = a.usuario_sistema
  UNION ALL
  SELECT 'asset_history', h.id, 'activo', h.asset_id, h.tipo_evento::text,
         h.descripcion, h.usuario_sistema, u.nombre,
         h.datos_anteriores, h.datos_nuevos, h.created_at,
         concat_ws(' ', s.marca, s.modelo, '(' || s.numero_serie || ')')
  FROM asset_history h LEFT JOIN assets s ON s.id = h.asset_id LEFT JOIN system_users u ON u.email = h.usuario_sistema
  UNION ALL
  SELECT 'workflow_transition', t.id, 'solicitud', t.request_id, t.estado_anterior::text || '>' || t.estado_nuevo::text,
         coalesce(nullif(t.comentario, ''), 'Cambio de estado'), u.email, u.nombre,
         NULL::jsonb, t.datos_accion, t.created_at, r.numero
  FROM workflow_transitions t JOIN system_users u ON u.id = t.ejecutado_por_id JOIN workflow_requests r ON r.id = t.request_id
`;

function condiciones(f: FiltrosAuditoria): Prisma.Sql {
  const y: Prisma.Sql[] = [];
  if (f.modulo) y.push(Prisma.sql`e.modulo = ${f.modulo}`);
  if (f.usuario) {
    const patron = `%${f.usuario}%`;
    y.push(Prisma.sql`(e.usuario_email ILIKE ${patron} OR e.usuario_nombre ILIKE ${patron})`);
  }
  if (f.search) {
    const patron = `%${f.search}%`;
    y.push(Prisma.sql`(e.descripcion ILIKE ${patron} OR e.contexto ILIKE ${patron})`);
  }
  if (f.rango?.gte) y.push(Prisma.sql`e.created_at >= ${f.rango.gte}`);
  if (f.rango?.lt) y.push(Prisma.sql`e.created_at < ${f.rango.lt}`);
  return y.length ? Prisma.sql`WHERE ${Prisma.join(y, ' AND ')}` : Prisma.empty;
}

export async function consultarAuditoria(f: FiltrosAuditoria) {
  const where = condiciones(f);
  const [filas, [{ total }]] = await Promise.all([
    prisma.$queryRaw<FilaAuditoria[]>`
      SELECT * FROM (${EVENTOS}) e ${where}
      ORDER BY e.created_at DESC, e.id
      LIMIT ${f.limit} OFFSET ${(f.page - 1) * f.limit}`,
    prisma.$queryRaw<[{ total: number }]>`SELECT count(*)::int AS total FROM (${EVENTOS}) e ${where}`,
  ]);
  const nombres = await nombresDeReferencias(filas);
  return { data: filas.map((fila) => aEvento(fila, nombres)), total };
}

// ---------------------------------------------------------------------------
// Detalle legible: "Campo · Antes · Despues", solo lo que cambio (decision
// de Javier), con nombres en vez de identificadores.
// ---------------------------------------------------------------------------

const CAMPO_LABEL: Record<string, string> = {
  nombre: 'Nombre',
  email: 'Correo',
  rol: 'Rol',
  activo: 'Activo',
  sedeId: 'Sede',
  sedeDestinoId: 'Sede destino',
  estado: 'Estado',
  cantidad: 'Cantidad',
  numeroFactura: 'N° de factura',
  rutProveedor: 'RUT del proveedor',
  tipoCompra: 'Tipo de compra',
  lineasKit: 'Líneas de Kit/EPP',
  cantidadEquipos: 'Equipos',
  equipos: 'Equipos',
  equiposVinculados: 'Equipos vinculados',
  equiposNuevos: 'Equipos nuevos',
  cantidadActivosVinculados: 'Activos vinculados',
  cantidadArticulosKitVinculados: 'Artículos de Kit/EPP vinculados',
  tipoId: 'Tipo de mantención',
  assetId: 'Activo',
  resultadoTipo: 'Resultado',
  resultado: 'Resultado',
  recibidoPor: 'Recibido por',
  recibidos: 'Recibidos',
  unidadesKit: 'Unidades de Kit/EPP',
  descripcion: 'Descripción',
  categoria: 'Categoría',
  motivoAnulacion: 'Motivo de anulación',
  motivoBaja: 'Motivo de baja',
  motivo: 'Motivo',
  realizadoPor: 'Realizado por',
  fechaProgramada: 'Fecha programada',
  horaProgramada: 'Hora programada',
  empleadoActualId: 'Asignado a',
  numeroSerie: 'N° de serie',
  marca: 'Marca',
  modelo: 'Modelo',
  condicion: 'Condición',
  condicionFinal: 'Condición final',
  estadoDevolucion: 'Estado en la devolución',
  fecha: 'Fecha',
  fechaBaja: 'Fecha de baja',
  deletedAt: 'Descartado',
  costo: 'Costo',
  stockMinimo: 'Stock mínimo',
  requiereSerie: 'Pide N° de serie',
  requiereImei: 'Pide IMEI',
  tipoFicha: 'Qué campos pide',
  duracionSesionHoras: 'Duración de sesión (horas)',
  maxIntentosLogin: 'Intentos máximos',
  minutosBloqueoLogin: 'Minutos de bloqueo',
  maxIntentosIp: 'Intentos por equipo',
  minutosBloqueoIp: 'Minutos de bloqueo del equipo',
  catalogo: 'Catálogo',
  activosCorregidos: 'Activos corregidos',
  codigo: 'Código',
  activa: 'Activa',
};

// Datos internos que no le dicen nada a quien revisa (numeracion de la
// importacion, identificadores de enlaces que ya muestra el contexto).
const CAMPOS_OCULTOS = new Set(['indice', 'total', 'historicaSinPersona', 'guideId', 'purchaseId', 'maintenanceId', 'datosAccion']);

const ESTADO_MANTENCION: Record<string, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};
const ROL_LABEL: Record<string, string> = { admin: 'Administrador', tecnico: 'Técnico' };
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

type Nombres = Map<string, string>;

/** Busca de una vez los nombres de las sedes, empleados, activos y tipos citados en la pagina. */
async function nombresDeReferencias(filas: FilaAuditoria[]): Promise<Nombres> {
  const ids = { sede: new Set<string>(), empleado: new Set<string>(), activo: new Set<string>(), tipo: new Set<string>() };
  for (const f of filas) {
    for (const datos of [f.datos_anteriores, f.datos_nuevos]) {
      if (!datos || typeof datos !== 'object') continue;
      const d = datos as Record<string, unknown>;
      for (const [clave, grupo] of [
        ['sedeId', 'sede'],
        ['sedeDestinoId', 'sede'],
        ['empleadoActualId', 'empleado'],
        ['assetId', 'activo'],
        ['tipoId', 'tipo'],
      ] as const) {
        if (typeof d[clave] === 'string') ids[grupo].add(d[clave] as string);
      }
    }
  }
  const [sedes, empleados, activos, tipos] = await Promise.all([
    ids.sede.size ? prisma.sede.findMany({ where: { id: { in: [...ids.sede] } }, select: { id: true, nombre: true } }) : [],
    ids.empleado.size
      ? prisma.employee.findMany({ where: { id: { in: [...ids.empleado] } }, select: { id: true, nombres: true, apellidoPaterno: true } })
      : [],
    ids.activo.size
      ? prisma.asset.findMany({ where: { id: { in: [...ids.activo] } }, select: { id: true, marca: true, modelo: true, numeroSerie: true } })
      : [],
    ids.tipo.size ? prisma.maintenanceType.findMany({ where: { id: { in: [...ids.tipo] } }, select: { id: true, nombre: true } }) : [],
  ]);
  return new Map<string, string>([
    ...sedes.map((s) => [s.id, s.nombre] as [string, string]),
    ...empleados.map((e) => [e.id, `${e.nombres} ${e.apellidoPaterno}`] as [string, string]),
    ...activos.map((a) => [a.id, `${a.marca} ${a.modelo}${a.numeroSerie ? ` (${a.numeroSerie})` : ''}`] as [string, string]),
    ...tipos.map((t) => [t.id, t.nombre] as [string, string]),
  ]);
}

/** Un valor en palabras segun su campo y el modulo. */
export function valorLegible(campo: string, valor: unknown, modulo: string, nombres: Nombres = new Map()): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (Array.isArray(valor)) return `${valor.length}`;
  if (typeof valor === 'object') return JSON.stringify(valor);
  const texto = String(valor);
  if (nombres.has(texto)) return nombres.get(texto)!;
  if (campo === 'estado') {
    const mapa: Record<string, string> =
      modulo === 'activo' ? ESTADO_ACTIVO_LABEL : modulo === 'guia_despacho' ? ESTADO_GUIA_LABELS : modulo === 'mantencion' ? ESTADO_MANTENCION : {};
    return mapa[texto] ?? texto;
  }
  if (campo === 'rol') return ROL_LABEL[texto] ?? texto;
  if (campo === 'condicion' || campo === 'condicionFinal') return (CONDICION_ACTIVO_LABEL as Record<string, string>)[texto] ?? texto;
  if (campo === 'estadoDevolucion') return etiquetaEstadoDevolucion(texto);
  if (campo === 'categoria' && modulo === 'kit_item') return texto === 'epp' ? 'EPP' : 'Kit de bienvenida';
  if (campo === 'deletedAt') return 'Sí';
  if (ISO.test(texto)) {
    return new Date(texto).toLocaleString('es-CL', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      ...(texto.includes('T00:00:00.000Z') ? {} : { hour: '2-digit', minute: '2-digit' }),
    });
  }
  return texto;
}

export type CambioAuditoria = { campo: string; antes: string | null; despues: string | null };

/**
 * Filas "Campo · Antes · Despues". Al editar, solo lo que cambio; al crear
 * o eliminar (o en eventos sin "antes"), los datos que trae.
 */
export function cambiosLegibles(
  antes: unknown,
  despues: unknown,
  modulo: string,
  nombres: Nombres = new Map()
): CambioAuditoria[] {
  const a = antes && typeof antes === 'object' && !Array.isArray(antes) ? (antes as Record<string, unknown>) : null;
  const d = despues && typeof despues === 'object' && !Array.isArray(despues) ? (despues as Record<string, unknown>) : null;
  if (!a && !d) return [];
  const campos = [...new Set([...Object.keys(a ?? {}), ...Object.keys(d ?? {})])].filter((c) => !CAMPOS_OCULTOS.has(c));
  const cambios: CambioAuditoria[] = [];
  for (const campo of campos) {
    const va = a?.[campo];
    const vd = d?.[campo];
    if (a && d && JSON.stringify(va) === JSON.stringify(vd)) continue;
    cambios.push({
      campo: CAMPO_LABEL[campo] ?? campo,
      antes: a ? valorLegible(campo, va, modulo, nombres) : null,
      despues: d ? valorLegible(campo, vd, modulo, nombres) : null,
    });
  }
  return cambios;
}

/** Donde ver el registro afectado, si tiene pantalla propia. */
const ENLACE: Record<string, (id: string) => string> = {
  activo: (id) => `/activos/${id}`,
  solicitud: (id) => `/solicitudes/${id}`,
  compra: (id) => `/compras/${id}`,
  guia_despacho: (id) => `/despachos/${id}`,
  mantencion: (id) => `/mantenciones/${id}`,
  empleado: (id) => `/empleados/${id}`,
};

function accionLegible(fila: FilaAuditoria): string {
  if (fila.fuente === 'workflow_transition') {
    const [de, a] = fila.accion.split('>');
    return `${STATE_LABELS[de as keyof typeof STATE_LABELS] ?? de} → ${STATE_LABELS[a as keyof typeof STATE_LABELS] ?? a}`;
  }
  return ACCION_LABEL[fila.accion] ?? fila.accion;
}

function aEvento(fila: FilaAuditoria, nombres: Nombres) {
  const eliminado = fila.fuente === 'auditlog' && fila.accion === 'eliminar';
  return {
    id: `${fila.fuente}-${fila.id}`,
    fuente: fila.fuente,
    modulo: fila.modulo,
    moduloLabel: MODULOS_AUDITORIA[fila.modulo] ?? fila.modulo,
    accion: accionLegible(fila),
    descripcion: fila.descripcion,
    usuario: fila.usuario_nombre ?? fila.usuario_email,
    usuarioEmail: fila.usuario_email,
    contexto: fila.contexto,
    enlace: !eliminado && ENLACE[fila.modulo] ? ENLACE[fila.modulo](fila.entidad_id) : null,
    cambios: cambiosLegibles(fila.datos_anteriores, fila.datos_nuevos, fila.modulo, nombres),
    createdAt: fila.created_at,
  };
}

export type EventoAuditoria = ReturnType<typeof aEvento>;
