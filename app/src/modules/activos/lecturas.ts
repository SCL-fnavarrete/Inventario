import { prisma } from '@/shared/prisma';
import { NotFoundError } from '@/shared/errores';
import { LINEAS_DEL_EQUIPO, whereFiltrosActivos, type FiltrosActivos } from '@/modules/activos/consultas';

/**
 * Lecturas de Activos contra la base (SPEC 3.2.2): la lista, las tarjetas y
 * el detalle. Las rutas y las pantallas del servidor las llaman; nadie mas
 * consulta la tabla de activos por su cuenta.
 */

/** Lista paginada con los filtros de la pantalla (SPEC 2.116.6). */
export async function listarActivos(
  filtros: FiltrosActivos & { empleadoActualId?: string },
  { page, limit }: { page: number; limit: number }
) {
  const where = whereFiltrosActivos(filtros);
  if (filtros.empleadoActualId) where.empleadoActualId = filtros.empleadoActualId;

  const [data, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      include: {
        categoria: { select: { id: true, nombre: true, tipoFicha: true } },
        empleadoActual: {
          select: {
            id: true,
            nombres: true,
            apellidoPaterno: true,
            // El correo de empresa es el que las pantallas muestran como identificador.
            correoEmpresa: true,
            correoPersonal: true,
            cargo: true,
          },
        },
        sede: { select: { id: true, nombre: true } },
        lineas: LINEAS_DEL_EQUIPO,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.asset.count({ where }),
  ]);
  return { data, pagination: { total, pages: Math.ceil(total / limit), current: page, limit } };
}

/**
 * Tarjetas de Activos. Cuentan con los mismos filtros que la lista, salvo el
 * suyo: las de estado ignoran el estado elegido y las pestañas de categoria
 * la categoria elegida. Si no, al elegir "Disponible" las demas quedarian en 0.
 */
export async function resumenActivos(filtrosLista: FiltrosActivos) {
  const { estado: _estado, porLlegar: _porLlegar, ...filtros } = filtrosLista;
  const whereVigentes = whereFiltrosActivos(filtros);
  const whereSinCategoria = whereFiltrosActivos({ ...filtros, categoriaId: '' });

  const [total, porEstado, categorias, porCondicion, porLlegar] = await Promise.all([
    prisma.asset.count({ where: whereVigentes }),
    prisma.asset.groupBy({ by: ['estado'], where: whereVigentes, _count: { estado: true } }),
    prisma.assetCategory.findMany({
      select: { id: true, nombre: true, _count: { select: { assets: { where: whereSinCategoria } } } },
      orderBy: { assets: { _count: 'desc' } },
    }),
    prisma.asset.groupBy({ by: ['condicion'], where: whereVigentes, _count: { condicion: true } }),
    // Los que vienen en camino a la sede del menu (SPEC 2.108); null con "Todas".
    filtros.sedeIdFiltro
      ? prisma.asset.count({ where: whereFiltrosActivos({ ...filtros, porLlegar: true }) })
      : Promise.resolve(null),
  ]);

  const byStatus: Record<string, number> = {
    disponible: 0,
    asignado: 0,
    en_mantencion: 0,
    baja: 0,
    no_devuelto: 0,
    en_transito: 0,
    por_repartir: 0,
  };
  for (const e of porEstado) if (e.estado) byStatus[e.estado] = e._count.estado;
  const byCondition: Record<string, number> = { nuevo: 0, usado: 0, danado: 0 };
  for (const c of porCondicion) if (c.condicion) byCondition[c.condicion] = c._count.condicion;

  return {
    total,
    porLlegar,
    // "Por repartir" (SPEC 2.111.6): igual que su tarjeta de estado.
    porRepartir: byStatus.por_repartir,
    byStatus,
    byCategory: categorias.map((c) => ({ id: c.id, nombre: c.nombre, count: c._count.assets })),
    byCondition,
  };
}

/** Detalle de un equipo para las pantallas que lo editan, venden o dan de baja. */
export async function detalleActivo(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      categoria: true,
      empleadoActual: { select: { nombres: true, apellidoPaterno: true, rut: true } },
      assignments: {
        where: { activo: true },
        select: {
          id: true,
          activo: true,
          employee: { select: { id: true, nombres: true, apellidoPaterno: true, rut: true } },
        },
      },
      // Mantenciones abiertas: la pagina de baja (SPEC 2.88) cierra una de
      // ellas (mantencionACerrar) en vez de crear otra.
      maintenances: {
        where: { estado: { in: ['pendiente', 'en_proceso'] } },
        select: { id: true, estado: true, descripcion: true, tipo: { select: { nombre: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!asset) throw new NotFoundError('Activo no encontrado');
  return asset;
}

/**
 * Ficha completa de un equipo (pantalla /activos/[id]): historial reciente,
 * asignaciones, mantenciones y la compra con que llego. Null si no existe.
 */
export async function fichaActivo(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      categoria: true,
      sede: { select: { nombre: true } },
      empleadoActual: { select: { nombres: true, apellidoPaterno: true, rut: true } },
      history: { orderBy: { createdAt: 'desc' }, take: 20 },
      assignments: {
        include: { employee: { select: { nombres: true, apellidoPaterno: true, rut: true } } },
        orderBy: { fechaEntrega: 'desc' },
        take: 10,
      },
      maintenances: { orderBy: { createdAt: 'desc' }, take: 5 },
      lineas: LINEAS_DEL_EQUIPO,
      // La compra con que llego, si hay (relacion n a n; en la practica una).
      purchaseAssets: {
        include: { purchase: { include: { sede: { select: { nombre: true } } } } },
        orderBy: { purchase: { fechaFactura: 'desc' } },
      },
    },
  });
  if (!asset) return asset;

  // Asignaciones historicas sin persona identificada (de una importacion
  // antigua): no pueden ser un Assignment, porque exige empleado. Quedan como
  // historial marcado con datosNuevos.historicaSinPersona y se leen aparte
  // (no del historial de arriba, que llega a 20) para mostrarlas junto a las
  // asignaciones reales.
  const asignacionesHistoricas = await prisma.assetHistory.findMany({
    where: { assetId: asset.id, tipoEvento: 'asignacion' },
    orderBy: { createdAt: 'asc' },
  });
  return {
    ...asset,
    historialAsignacionesSinPersona: asignacionesHistoricas.filter(
      (h) => (h.datosNuevos as { historicaSinPersona?: boolean } | null)?.historicaSinPersona === true
    ),
  };
}
