import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { NotFoundError } from '@/shared/errores';
import { filtroSede } from '@/shared/sedes/filtro';
import { inicioDeHoy } from '@/shared/utilidades/fechas';
import { busquedaActivo, palabrasDeBusqueda } from '@/modules/activos';
import type { MaintenanceFilters, VistaMantencion } from '@/modules/mantenciones/validaciones';

/**
 * Mantenciones de la sede elegida en el nav, o de todas (SPEC 2.117): via la
 * sede del activo, porque Maintenance no tiene sedeId propio.
 */
export function whereSedeMantencion(sedeIdFiltro?: string | null): Prisma.MaintenanceWhereInput {
  return { asset: filtroSede(sedeIdFiltro) as Prisma.AssetWhereInput };
}

/**
 * Ventana del selector de periodo (Dia, Semana, Mes...), contada desde hoy en
 * Chile. 0 = sin limite ("Historial completo").
 */
export function ventanaPeriodo(hoy: Date, dias: number, diasCompletadas: number) {
  const masDias = (n: number) => {
    const d = new Date(hoy);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  return {
    hoy,
    /** Hasta cuando cuentan las proximas (null = todas las futuras). */
    limiteProximas: dias > 0 ? masDias(dias) : null,
    /** Desde cuando cuentan las completadas (null = todas). */
    inicioCompletadas: diasCompletadas > 0 ? masDias(-diasCompletadas) : null,
  };
}
type Ventana = ReturnType<typeof ventanaPeriodo>;

/**
 * Cada tarjeta de resumen de Mantenciones es un filtro (SPEC 2.107): la misma
 * condicion cuenta el numero de la tarjeta y filtra la lista al pulsarla,
 * asi los dos siempre coinciden.
 */
export const VISTAS_MANTENCION = {
  /** Pendientes con la fecha pasada (una en proceso ya se esta haciendo). */
  vencidas: (v: Ventana): Prisma.MaintenanceWhereInput => ({
    estado: 'pendiente',
    fechaProgramada: { lt: v.hoy },
  }),
  /** Pendientes por venir, dentro del periodo. */
  proximas: (v: Ventana): Prisma.MaintenanceWhereInput => ({
    estado: 'pendiente',
    fechaProgramada: v.limiteProximas ? { gte: v.hoy, lte: v.limiteProximas } : { gte: v.hoy },
  }),
  en_proceso: (): Prisma.MaintenanceWhereInput => ({ estado: 'en_proceso' }),
  /** Por fecha realizada, dentro del periodo. */
  completadas: (v: Ventana): Prisma.MaintenanceWhereInput => ({
    estado: 'completada',
    ...(v.inicioCompletadas ? { fechaRealizada: { gte: v.inicioCompletadas } } : {}),
  }),
} as const satisfies Record<VistaMantencion, (v: Ventana) => Prisma.MaintenanceWhereInput>;

/**
 * Lo que cuenta dentro del periodo elegido (la lista sin filtros y la tarjeta
 * "Total"): vencidas y en proceso siempre, proximas y completadas dentro de
 * la ventana, y las pendientes sin fecha y las canceladas. null = sin limite.
 */
export function filtroPeriodo(v: Ventana): Prisma.MaintenanceWhereInput | null {
  if (!v.limiteProximas && !v.inicioCompletadas) return null;
  return {
    OR: [
      VISTAS_MANTENCION.vencidas(v),
      VISTAS_MANTENCION.en_proceso(),
      VISTAS_MANTENCION.proximas(v),
      { estado: 'pendiente', fechaProgramada: null },
      VISTAS_MANTENCION.completadas(v),
      { estado: 'cancelada' },
    ],
  };
}

/** Lo que el listado y el calendario muestran de cada mantencion. */
export const INCLUDE_LISTADO_MANTENCION = {
  tipo: true,
  asset: {
    include: {
      categoria: true,
      empleadoActual: {
        select: { id: true, rut: true, nombres: true, apellidoPaterno: true },
      },
    },
  },
} satisfies Prisma.MaintenanceInclude;

type Grupo = {
  where: Prisma.MaintenanceWhereInput;
  orderBy: Prisma.MaintenanceOrderByWithRelationInput[];
};

/**
 * Orden de agenda del listado de mantenciones (SPEC 2.98): primero lo que se
 * esta haciendo, despues lo que viene, despues lo atrasado y al final lo
 * cerrado. Antes iba solo por fecha, de la mas antigua a la mas nueva, y lo
 * que venia quedaba paginas atras de las vencidas.
 */
export function gruposAgenda(hoy: Date): Grupo[] {
  const porFecha = (orden: 'asc' | 'desc') => [
    { fechaProgramada: orden },
    { horaProgramada: orden },
  ] satisfies Prisma.MaintenanceOrderByWithRelationInput[];
  return [
    { where: VISTAS_MANTENCION.en_proceso(), orderBy: porFecha('asc') },
    {
      where: { estado: 'pendiente', OR: [{ fechaProgramada: { gte: hoy } }, { fechaProgramada: null }] },
      orderBy: porFecha('asc'),
    },
    // Vencidas: la mas reciente primero, es la que todavia se puede alcanzar.
    { where: VISTAS_MANTENCION.vencidas(ventanaPeriodo(hoy, 0, 0)), orderBy: porFecha('desc') },
    {
      where: { estado: { in: ['completada', 'cancelada'] } },
      orderBy: [{ fechaRealizada: 'desc' }, { updatedAt: 'desc' }],
    },
  ];
}

/**
 * Pagina una consulta repartida en grupos que van uno detras del otro: salta
 * los grupos que caen enteros antes de la pagina pedida y completa la pagina
 * con los siguientes. El total es la suma de los grupos.
 */
export async function paginarPorGrupos(
  where: Prisma.MaintenanceWhereInput,
  grupos: Grupo[],
  skip: number,
  take: number
) {
  const totales = await Promise.all(
    grupos.map((g) => prisma.maintenance.count({ where: { AND: [where, g.where] } }))
  );
  const data = [];
  let saltar = skip;
  let faltan = take;
  for (let i = 0; i < grupos.length && faltan > 0; i++) {
    if (saltar >= totales[i]) {
      saltar -= totales[i];
      continue;
    }
    const filas = await prisma.maintenance.findMany({
      where: { AND: [where, grupos[i].where] },
      include: INCLUDE_LISTADO_MANTENCION,
      orderBy: grupos[i].orderBy,
      skip: saltar,
      take: faltan,
    });
    data.push(...filas);
    faltan -= filas.length;
    saltar = 0;
  }
  return { data, total: totales.reduce((a, b) => a + b, 0) };
}

/** Condiciones que se suman al AND de un where (sin perder las que ya tenia). */
function sumarAnd(where: Prisma.MaintenanceWhereInput, condiciones: Prisma.MaintenanceWhereInput[]) {
  const previas = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  where.AND = [...previas, ...condiciones];
}

/**
 * Lista de Mantenciones (GET /api/mantenciones) con los filtros de la
 * pantalla. Sin orden pedido va en orden de agenda (en proceso, proximas,
 * vencidas, cerradas; SPEC 2.98).
 */
export async function listarMantenciones(filters: MaintenanceFilters, sedeId: string | null) {
  const skip = (filters.page - 1) * filters.limit;
  const where = whereSedeMantencion(sedeId);
  if (filters.assetId) where.assetId = filters.assetId;
  if (filters.tipoId) where.tipoId = filters.tipoId;
  if (filters.estado) where.estado = filters.estado;

  // Busqueda por palabras sobre el equipo y la persona que lo tiene: cada
  // palabra debe aparecer en algun campo (no necesariamente el mismo).
  if (filters.search) {
    sumarAnd(
      where,
      palabrasDeBusqueda(filters.search).map((palabra) => ({ asset: busquedaActivo(palabra) }))
    );
  }
  if (filters.pendientes) where.estado = { in: ['pendiente', 'en_proceso'] };
  if (filters.fechaDesde || filters.fechaHasta) {
    where.fechaProgramada = {};
    if (filters.fechaDesde) where.fechaProgramada.gte = new Date(filters.fechaDesde);
    if (filters.fechaHasta) where.fechaProgramada.lte = new Date(filters.fechaHasta);
  }

  // Periodo y tarjeta pulsada, con las mismas reglas que cuentan las tarjetas
  // (SPEC 2.107): el numero de la tarjeta y la lista siempre coinciden.
  const ventana = ventanaPeriodo(
    inicioDeHoy(),
    filters.dias ?? filters.diasCompletadas ?? 0,
    filters.diasCompletadas ?? filters.dias ?? 0
  );
  const vista = filters.vista ?? (filters.vencidas ? 'vencidas' : undefined);
  const condiciones = [filtroPeriodo(ventana), vista ? VISTAS_MANTENCION[vista](ventana) : null].filter(
    (c): c is Prisma.MaintenanceWhereInput => c !== null
  );
  if (condiciones.length > 0) sumarAnd(where, condiciones);

  // Con sortBy, ese campo; por fecha, la hora desempata.
  const { sortBy } = filters;
  const { data, total } = !sortBy
    ? await paginarPorGrupos(where, gruposAgenda(inicioDeHoy()), skip, filters.limit)
    : await Promise.all([
        prisma.maintenance.findMany({
          where,
          include: INCLUDE_LISTADO_MANTENCION,
          orderBy:
            sortBy === 'fechaProgramada'
              ? [{ fechaProgramada: filters.sortOrder }, { horaProgramada: filters.sortOrder }]
              : { [sortBy]: filters.sortOrder },
          skip,
          take: filters.limit,
        }),
        prisma.maintenance.count({ where }),
      ]).then(([data, total]) => ({ data, total }));

  return {
    data,
    pagination: { total, page: filters.page, limit: filters.limit, totalPages: Math.ceil(total / filters.limit) },
  };
}

/**
 * Tarjetas de Mantenciones (GET /api/mantenciones/pendientes): cada una
 * cuenta con la misma condicion que usa la lista al pulsarla, y "Total" con
 * la del periodo sin mas filtros. 0 dias = sin limite de fecha.
 */
export async function resumenMantenciones(p: { dias: number; diasCompletadas: number; sedeId: string | null }) {
  const ventana = ventanaPeriodo(inicioDeHoy(), p.dias, p.diasCompletadas);
  const sede = whereSedeMantencion(p.sedeId);
  const contar = (condicion: object | null) =>
    prisma.maintenance.count({ where: { AND: [sede, condicion ?? {}] } });
  const [totalVencidas, totalProximas, totalEnProceso, totalCompletadas, total] = await Promise.all([
    contar(VISTAS_MANTENCION.vencidas(ventana)),
    contar(VISTAS_MANTENCION.proximas(ventana)),
    contar(VISTAS_MANTENCION.en_proceso()),
    contar(VISTAS_MANTENCION.completadas(ventana)),
    contar(filtroPeriodo(ventana)),
  ]);
  return { stats: { totalVencidas, totalProximas, totalEnProceso, totalCompletadas, total } };
}

/** Detalle de una mantencion, con su equipo y la persona que lo tiene. */
export async function detalleMantencion(id: string) {
  const mantencion = await prisma.maintenance.findUnique({
    where: { id },
    include: {
      tipo: true,
      asset: {
        include: {
          categoria: true,
          empleadoActual: {
            select: {
              id: true,
              rut: true,
              nombres: true,
              apellidoPaterno: true,
              apellidoMaterno: true,
              // El correo de empresa es el identificador visible del empleado.
              correoEmpresa: true,
              correoPersonal: true,
              cargo: true,
            },
          },
        },
      },
    },
  });
  if (!mantencion) throw new NotFoundError('Mantención no encontrada');
  return mantencion;
}
