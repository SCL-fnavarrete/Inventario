import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

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
    { where: { estado: 'en_proceso' }, orderBy: porFecha('asc') },
    {
      where: { estado: 'pendiente', OR: [{ fechaProgramada: { gte: hoy } }, { fechaProgramada: null }] },
      orderBy: porFecha('asc'),
    },
    // Vencidas: la mas reciente primero, es la que todavia se puede alcanzar.
    { where: { estado: 'pendiente', fechaProgramada: { lt: hoy } }, orderBy: porFecha('desc') },
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
