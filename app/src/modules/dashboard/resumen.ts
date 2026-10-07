import { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { filtroSede } from '@/shared/sedes/filtro';
import { inicioDeHoy } from '@/shared/utilidades/fechas';
import { ACTIVOS_VIGENTES, ESTADO_ACTIVO_COLOR } from '@/modules/activos';
import { lineasPorConfirmar } from '@/modules/lineas/servidor';

/**
 * Trae todos los datos del Resumen del Dashboard en un unico batch de
 * consultas paralelas para evitar round-trips secuenciales y duplicados.
 */
export async function resumenDashboard(sedeIdFiltro: string | null) {
  // Todo el inventario, o la sede elegida en el navbar (SPEC 2.117). `sw` es
  // el filtro directo; Maintenance y Assignment no tienen sedeId propio y se
  // filtran via su relacion a Asset. `swAsset` tambien excluye activos con
  // `deletedAt` (ACTIVOS_VIGENTES).
  const sw = filtroSede(sedeIdFiltro);
  const swAsset = { asset: { ...sw, ...ACTIVOS_VIGENTES } };

  // Las fechas de mantencion son de calendario: se comparan contra el dia de
  // hoy, asi una programada para hoy es "proxima" y no "vencida".
  const today = inicioDeHoy();
  const nextWeek = new Date(today);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const treintaDiasAtras = new Date();
  treintaDiasAtras.setDate(treintaDiasAtras.getDate() - 30);
  // Inicio del periodo del grafico de movimientos: el primer dia del mes de
  // hace 5 meses, asi el grafico cubre 6 meses completos (este incluido).
  const ahora = new Date();
  const sixMonthsAgo = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 5, 1));

  // Mantenciones del panel de alertas (SPEC 2.125): solo las mas urgentes de
  // cada grupo; el resto se cuenta en la base. Asi el Dashboard cuesta lo
  // mismo con 10 que con 10.000 (antes traia todas y dibujaba una tarjeta
  // por cada una).
  const vencidas = { estado: "pendiente" as const, fechaProgramada: { lt: today }, ...swAsset };
  const proximas = { estado: "pendiente" as const, fechaProgramada: { gte: today, lte: nextWeek }, ...swAsset };
  const mantencionesDelPanel = (where: Prisma.MaintenanceWhereInput) =>
    prisma.maintenance.findMany({
      where,
      // La vencida mas antigua y la proxima mas cercana, primero.
      orderBy: [{ fechaProgramada: "asc" }, { horaProgramada: "asc" }],
      take: ALERTAS_POR_GRUPO,
      select: {
        id: true,
        descripcion: true,
        fechaProgramada: true,
        horaProgramada: true,
        asset: {
          select: {
            numeroSerie: true,
            imei: true,
            marca: true,
            modelo: true,
            sede: { select: { nombre: true } },
          },
        },
      },
    });

  const [
    totalAssets,
    assetsPorCategoriaYEstado,
    categoriesRaw,
    mantencionesVencidas,
    totalVencidas,
    mantencionesProximas,
    totalProximas,
    totalMantencionesPendientes,
    movimientosPorMes,
    recentAssignments,
    solicitudesAbiertas,
    kitItems,
    equiposSinSede,
    lineasSinConfirmar,
  ] = await Promise.all([
    prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sw } }),
    prisma.asset.groupBy({
      by: ["categoriaId", "estado"],
      where: { ...ACTIVOS_VIGENTES, ...sw },
      _count: true,
    }),
    prisma.assetCategory.findMany({
      select: { id: true, nombre: true, stockMinimo: true },
    }),
    mantencionesDelPanel(vencidas),
    prisma.maintenance.count({ where: vencidas }),
    mantencionesDelPanel(proximas),
    prisma.maintenance.count({ where: proximas }),
    prisma.maintenance.count({ where: { estado: "pendiente", ...swAsset } }),
    // Entregas y devoluciones por mes, contadas en la base (SPEC 2.125): una
    // devolucion cuenta en su mes aunque el equipo se entregara antes.
    prisma.$queryRaw<{ mes: string; asignaciones: number; devoluciones: number }[]>`
      SELECT mes, sum(entrega)::int AS asignaciones, sum(devolucion)::int AS devoluciones
      FROM (
        SELECT to_char(a.fecha_entrega, 'YYYY-MM') AS mes, 1 AS entrega, 0 AS devolucion
        FROM assignments a JOIN assets s ON s.id = a.asset_id
        WHERE a.fecha_entrega >= ${sixMonthsAgo} AND s.deleted_at IS NULL ${soloSede(sedeIdFiltro)}
        UNION ALL
        SELECT to_char(a.fecha_devolucion, 'YYYY-MM'), 0, 1
        FROM assignments a JOIN assets s ON s.id = a.asset_id
        WHERE a.fecha_devolucion >= ${sixMonthsAgo} AND s.deleted_at IS NULL ${soloSede(sedeIdFiltro)}
      ) movimientos
      GROUP BY mes`,
    prisma.assignment.count({ where: { fechaEntrega: { gte: treintaDiasAtras }, ...swAsset } }),
    prisma.workflowRequest.count({
      where: { fechaCierre: null, ...sw },
    }),
    prisma.welcomeKitItem.findMany({
      where: sw,
      orderBy: { nombre: 'asc' },
      include: { sede: { select: { nombre: true } } },
    }),
    // Equipos importados sin sede (SPEC 2.117): una tarea pendiente, se cuenta
    // con cualquier sede elegida en el navbar (por definicion no son de ninguna).
    prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, sedeId: null } }),
    // Lineas por confirmar (SPEC 2.131): tambien una tarea pendiente, de todas las sedes.
    lineasPorConfirmar(),
  ]);

  // Desglose de activos por categoria + estado, agregado en memoria a
  // partir del groupBy.
  const conteosPorCategoria = new Map<string, Record<string, number>>();
  for (const fila of assetsPorCategoriaYEstado) {
    const actual = conteosPorCategoria.get(fila.categoriaId) ?? {};
    actual[fila.estado] = fila._count;
    conteosPorCategoria.set(fila.categoriaId, actual);
  }

  function totalPorEstado(estado: string): number {
    return assetsPorCategoriaYEstado
      .filter((fila) => fila.estado === estado)
      .reduce((acc, fila) => acc + fila._count, 0);
  }

  const availableAssets = totalPorEstado("disponible");
  const assignedAssets = totalPorEstado("asignado");
  const maintenanceAssets = totalPorEstado("en_mantencion");
  const bajaAssets = totalPorEstado("baja");
  // Un activo vendido ya no forma parte del parque operativo, por eso no
  // suma en las tarjetas de arriba ni en "Stock por Categoria".
  const vendidoAssets = totalPorEstado("vendido");

  // Equipos que quedaron en manos de alguien desvinculado que no los
  // devolvio; se cuentan aparte de "asignado".
  const noDevueltoAssets = totalPorEstado("no_devuelto");

  // "Activos por Categoria": total vigente por categoria, todos los
  // estados, sumado en memoria desde el groupBy de arriba.
  const categories = categoriesRaw.map((cat) => {
    const conteos = conteosPorCategoria.get(cat.id) ?? {};
    const total = Object.values(conteos).reduce((acc, n) => acc + n, 0);
    return { id: cat.id, nombre: cat.nombre, stockMinimo: cat.stockMinimo, total };
  });

  // "Stock por Categoria" (grafico de barras apiladas): "vendido" queda
  // fuera de este calculo porque no es stock disponible.
  const stockByCategory = categoriesRaw.map((cat) => {
    const conteos = conteosPorCategoria.get(cat.id) ?? {};
    return {
      categoriaId: cat.id,
      categoria: cat.nombre,
      stockMinimo: cat.stockMinimo,
      disponibles: conteos["disponible"] ?? 0,
      asignados: conteos["asignado"] ?? 0,
      mantencion: conteos["en_mantencion"] ?? 0,
    };
  });

  // Alertas de stock de Activos, calculadas sobre los DISPONIBLES de cada
  // categoria: sin stock es 0 disponibles; stock bajo es cuando quedan
  // pocos segun el umbral configurable de cada categoria (stockMinimo).
  const sinStockCategorias = stockByCategory
    .filter((c) => c.disponibles === 0)
    .map((c) => ({ id: c.categoriaId, nombre: c.categoria }));
  const bajoStockCategorias = stockByCategory
    .filter((c) => c.disponibles > 0 && c.disponibles <= c.stockMinimo)
    .map((c) => ({ id: c.categoriaId, nombre: c.categoria, disponibles: c.disponibles, stockMinimo: c.stockMinimo }));

  // Estados para el pie chart, incluyendo "vendido".
  const estadosData = [
    { estado: "disponible", cantidad: availableAssets, color: ESTADO_ACTIVO_COLOR.disponible },
    { estado: "asignado", cantidad: assignedAssets, color: ESTADO_ACTIVO_COLOR.asignado },
    { estado: "en_mantencion", cantidad: maintenanceAssets, color: ESTADO_ACTIVO_COLOR.en_mantencion },
    { estado: "no_devuelto", cantidad: noDevueltoAssets, color: ESTADO_ACTIVO_COLOR.no_devuelto },
    { estado: "baja", cantidad: bajaAssets, color: ESTADO_ACTIVO_COLOR.baja },
    { estado: "vendido", cantidad: vendidoAssets, color: ESTADO_ACTIVO_COLOR.vendido },
  ].filter((e) => e.cantidad > 0);

  const pendingMaintenance = totalMantencionesPendientes;

  // Grafico de movimientos: los 6 meses parten en 0, asi un mes sin
  // movimientos tambien se muestra (antes se omitia y la linea saltaba).
  const monthlyData: Record<
    string,
    { asignaciones: number; devoluciones: number }
  > = {};
  for (let i = 0; i < 6; i++) {
    const mes = new Date(Date.UTC(sixMonthsAgo.getUTCFullYear(), sixMonthsAgo.getUTCMonth() + i, 1));
    monthlyData[mes.toISOString().slice(0, 7)] = { asignaciones: 0, devoluciones: 0 };
  }
  for (const { mes, asignaciones, devoluciones } of movimientosPorMes) {
    monthlyData[mes] = { asignaciones, devoluciones };
  }

  const asignacionesChartData = Object.entries(monthlyData)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, data]) => ({
      mes: formatMonth(mes),
      asignaciones: data.asignaciones,
      devoluciones: data.devoluciones,
    }));

  // Stock de Kit de Bienvenida y EPP, separados por categoria (reemplaza el
  // bloque de Acciones Rapidas: esto es lo que en la practica se revisa antes
  // de coordinar una entrega).
  const kitBienvenidaItems = kitItems
    .filter((item) => item.categoria === 'kit_bienvenida')
    .map((item) => ({ id: item.id, nombre: item.nombre, cantidad: item.cantidad, stockMinimo: item.stockMinimo }));
  const eppItems = kitItems
    .filter((item) => item.categoria === 'epp')
    .map((item) => ({ id: item.id, nombre: item.nombre, cantidad: item.cantidad, stockMinimo: item.stockMinimo }));

  // Alertas de stock (reemplazan la alerta de "Equipos Danados"): sin stock
  // es cantidad 0; stock bajo es cuando llega al umbral configurable de cada
  // articulo (stockMinimo, ver Configuracion > Kit y EPP) pero todavia queda
  // algo. Un articulo en 0 cuenta solo como "sin stock", no en ambas.
  const sinStockItems = kitItems
    .filter((item) => item.cantidad === 0)
    .map((item) => ({ id: item.id, nombre: item.nombre, categoria: item.categoria, sedeNombre: item.sede?.nombre ?? null }));
  const bajoStockItems = kitItems
    .filter((item) => item.cantidad > 0 && item.cantidad <= item.stockMinimo)
    .map((item) => ({ id: item.id, nombre: item.nombre, categoria: item.categoria, cantidad: item.cantidad, stockMinimo: item.stockMinimo, sedeNombre: item.sede?.nombre ?? null }));

  return {
    totalAssets,
    availableAssets,
    assignedAssets,
    maintenanceAssets,
    bajaAssets,
    vendidoAssets,
    noDevueltoAssets,
    pendingMaintenance,
    recentAssignments,
    categories,
    stockByCategory,
    estadosData,
    asignacionesChartData,
    solicitudesAbiertas,
    kitBienvenidaItems,
    eppItems,
    sinStockCategorias,
    bajoStockCategorias,
    sinStockItems,
    bajoStockItems,
    mantencionesVencidas,
    mantencionesProximas,
    totalVencidas,
    totalProximas,
    equiposSinSede,
    lineasPorConfirmar: lineasSinConfirmar,
  };
}

/** Cuantas mantenciones de cada grupo (vencidas, proximas) muestra el panel. */
export const ALERTAS_POR_GRUPO = 5;

/** Filtro de sede para las consultas SQL del resumen (vacio = todas). */
function soloSede(sedeId: string | null) {
  return sedeId ? Prisma.sql`AND s.sede_id = ${sedeId}` : Prisma.empty;
}

function formatMonth(mes: string): string {
  const [year, month] = mes.split("-");
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
}
