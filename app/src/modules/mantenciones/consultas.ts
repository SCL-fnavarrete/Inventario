import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { errorRepetido } from '@/shared/errores';
import { filtroSede } from '@/shared/sedes/filtro';

/**
 * Mantenciones de la sede elegida en el nav, o de todas (SPEC 2.117): via la
 * sede del activo, porque Maintenance no tiene sedeId propio.
 */
export function whereSedeMantencion(sedeIdFiltro?: string | null): Prisma.MaintenanceWhereInput {
  return { asset: filtroSede(sedeIdFiltro) as Prisma.AssetWhereInput };
}

/**
 * Un tipo de mantencion no puede repetir nombre (sin importar mayusculas).
 * El error marca el campo "nombre" del formulario. exceptoId: el tipo que se
 * esta editando.
 */
export async function assertNombreTipoLibre(nombre: string, exceptoId?: string) {
  const repetido = await prisma.maintenanceType.findFirst({
    where: {
      nombre: { equals: nombre.trim(), mode: 'insensitive' },
      ...(exceptoId ? { NOT: { id: exceptoId } } : {}),
    },
    select: { id: true },
  });
  if (repetido) throw errorRepetido('nombre', 'Ya existe un tipo de mantención con ese nombre');
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
} as const;

export type VistaMantencion = keyof typeof VISTAS_MANTENCION;

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
