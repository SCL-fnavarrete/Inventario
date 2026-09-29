import ExcelJS from 'exceljs';
import { prisma } from '@/shared/prisma';
import { formatearFecha, hoyISO } from '@/shared/utilidades/fechas';
import { whereFiltrosActivos, type FiltrosActivos } from '@/modules/activos/consultas';
import { CONDICION_ACTIVO_LABEL, ESTADO_ACTIVO_LABEL } from '@/modules/activos/estados';

/**
 * Excel de Activos (GET /api/activos/exportar). Tiene su propia puerta,
 * '@/modules/activos/excel', para no cargar exceljs en las demas rutas
 * (SPEC 3.2.2).
 */

// Grupos de columnas y su color de encabezado. Se usa exceljs en vez de
// xlsx (SheetJS CE) porque esta ultima no persiste estilos de celda.
const GRUPOS = {
  identificacion: { color: "FF4472C4", fontColor: "FFFFFFFF" }, // azul
  estadoUbicacion: { color: "FF70AD47", fontColor: "FFFFFFFF" }, // verde
  asignacion: { color: "FFED7D31", fontColor: "FFFFFFFF" }, // naranja
  especificaciones: { color: "FF7030A0", fontColor: "FFFFFFFF" }, // morado
  gestion: { color: "FF2E9999", fontColor: "FFFFFFFF" }, // verde azulado
  mantencion: { color: "FFFFC000", fontColor: "FF000000" }, // dorado
  fechas: { color: "FF808080", fontColor: "FFFFFFFF" }, // gris
  otros: { color: "FFA6A6A6", fontColor: "FF000000" }, // gris claro
} as const;

type GrupoKey = keyof typeof GRUPOS;

interface ColumnaDef {
  header: string;
  key: string;
  width: number;
  grupo: GrupoKey;
}

// Orden y agrupacion de columnas del detalle de Activos, incluyendo datos
// que viven en Employee, Assignment y Maintenance (no solo en Asset).
const COLUMNAS: ColumnaDef[] = [
  // Identificacion
  { header: "N° Serie", key: "numeroSerie", width: 20, grupo: "identificacion" },
  { header: "Nombre Equipo", key: "nombreEquipo", width: 20, grupo: "identificacion" },
  { header: "Categoría", key: "categoria", width: 12, grupo: "identificacion" },
  { header: "Marca", key: "marca", width: 12, grupo: "identificacion" },
  { header: "Modelo", key: "modelo", width: 20, grupo: "identificacion" },
  { header: "IMEI", key: "imei", width: 18, grupo: "identificacion" },
  { header: "N° Teléfono", key: "numeroTelefono", width: 15, grupo: "identificacion" },
  { header: "N° Activación", key: "numeroActivacion", width: 14, grupo: "identificacion" },
  { header: "Tipo Plan", key: "tipoPlan", width: 12, grupo: "identificacion" },
  // Estado y ubicacion
  { header: "Sede", key: "sede", width: 14, grupo: "estadoUbicacion" },
  { header: "Estado", key: "estado", width: 12, grupo: "estadoUbicacion" },
  { header: "Condición", key: "condicion", width: 10, grupo: "estadoUbicacion" },
  { header: "Ubicación Física", key: "ubicacionFisica", width: 15, grupo: "estadoUbicacion" },
  // Asignacion
  { header: "Asignado a", key: "asignadoA", width: 25, grupo: "asignacion" },
  { header: "RUT Asignado", key: "rutAsignado", width: 15, grupo: "asignacion" },
  { header: "Cargo Asignado", key: "cargoAsignado", width: 20, grupo: "asignacion" },
  { header: "Jefatura", key: "jefatura", width: 20, grupo: "asignacion" },
  { header: "Supervisor", key: "supervisor", width: 20, grupo: "asignacion" },
  { header: "Correo Empresa", key: "correoEmpresa", width: 26, grupo: "asignacion" },
  { header: "Fecha de Entrega", key: "fechaEntrega", width: 14, grupo: "asignacion" },
  // Especificaciones tecnicas
  { header: "Procesador", key: "procesador", width: 25, grupo: "especificaciones" },
  { header: "RAM", key: "ram", width: 8, grupo: "especificaciones" },
  { header: "Disco Duro", key: "discoDuro", width: 12, grupo: "especificaciones" },
  { header: "Sistema Operativo", key: "sistemaOperativo", width: 15, grupo: "especificaciones" },
  { header: "Pulgadas", key: "pulgadas", width: 8, grupo: "especificaciones" },
  { header: "Conectividad", key: "conectividad", width: 14, grupo: "especificaciones" },
  { header: "Tiene Cargador", key: "tieneCargador", width: 12, grupo: "especificaciones" },
  // Microsoft / gestion
  { header: "Microsoft 365", key: "microsoft365", width: 12, grupo: "gestion" },
  { header: "Licencia Microsoft 365", key: "licenciaMicrosoft365", width: 20, grupo: "gestion" },
  { header: "Intune Enrolled", key: "intuneEnrolled", width: 12, grupo: "gestion" },
  { header: "Lista Distribución", key: "listaDistribucion", width: 18, grupo: "gestion" },
  { header: "Antivirus", key: "antivirus", width: 15, grupo: "gestion" },
  // Mantencion
  { header: "Última Mantención Realizada", key: "ultimaMantencionRealizada", width: 16, grupo: "mantencion" },
  { header: "Próxima Mantención Programada", key: "proximaMantencionProgramada", width: 16, grupo: "mantencion" },
  // Fechas
  { header: "Fecha Compra", key: "fechaCompra", width: 12, grupo: "fechas" },
  { header: "Fin Garantía", key: "finGarantia", width: 12, grupo: "fechas" },
  { header: "Fecha Baja", key: "fechaBaja", width: 12, grupo: "fechas" },
  { header: "Fecha Venta", key: "fechaVenta", width: 12, grupo: "fechas" },
  { header: "Fecha Creación", key: "fechaCreacion", width: 12, grupo: "fechas" },
  // Otros
  { header: "Incidencia", key: "incidencia", width: 25, grupo: "otros" },
  { header: "Observaciones", key: "observaciones", width: 30, grupo: "otros" },
];

// Columnas de la hoja de Resumen (conteo por Sede x Estado).
function columnasResumen(estadosUnicos: string[]): ColumnaDef[] {
  return [
    { header: "Sede", key: "sede", width: 16, grupo: "identificacion" },
    { header: "Total", key: "total", width: 10, grupo: "estadoUbicacion" },
    ...estadosUnicos.map((estadoLabel) => ({
      header: estadoLabel,
      key: estadoLabel,
      width: 14,
      grupo: "gestion" as GrupoKey,
    })),
  ];
}

function aplicarEstiloEncabezado(worksheet: ExcelJS.Worksheet, columnas: ColumnaDef[]) {
  const filaEncabezado = worksheet.getRow(1);
  columnas.forEach((columna, index) => {
    const celda = filaEncabezado.getCell(index + 1);
    const { color, fontColor } = GRUPOS[columna.grupo];
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    celda.font = { bold: true, color: { argb: fontColor } };
    celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    celda.border = {
      top: { style: "thin", color: { argb: "FFFFFFFF" } },
      left: { style: "thin", color: { argb: "FFFFFFFF" } },
      bottom: { style: "thin", color: { argb: "FFFFFFFF" } },
      right: { style: "thin", color: { argb: "FFFFFFFF" } },
    };
  });
  filaEncabezado.height = 30;
}

// Bandeado de filas (gris muy claro en filas pares) para facilitar la
// lectura con muchas filas.
function aplicarBandeado(worksheet: ExcelJS.Worksheet, totalFilas: number, totalColumnas: number) {
  for (let fila = 2; fila <= totalFilas; fila++) {
    if (fila % 2 === 0) {
      const filaExcel = worksheet.getRow(fila);
      for (let col = 1; col <= totalColumnas; col++) {
        filaExcel.getCell(col).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F2F2" },
        };
      }
    }
  }
}

function crearHojaConEstilo(
  workbook: ExcelJS.Workbook,
  nombreHoja: string,
  columnas: ColumnaDef[],
  filas: Record<string, string | number>[]
) {
  const worksheet = workbook.addWorksheet(nombreHoja, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  worksheet.addRows(filas);

  aplicarEstiloEncabezado(worksheet, columnas);
  aplicarBandeado(worksheet, filas.length + 1, columnas.length);

  const ultimaColumnaLetra = worksheet.getColumn(columnas.length).letter;
  worksheet.autoFilter = {
    from: "A1",
    to: `${ultimaColumnaLetra}${filas.length + 1}`,
  };

  return worksheet;
}

function nombreDeHoja(nombre: string): string {
  return nombre.replace(/[\\/?*[\]]/g, "-").slice(0, 31);
}

/**
 * Arma el Excel con lo mismo que muestra la lista: sin descartados y con los
 * filtros elegidos (incluidos "Por llegar", la busqueda y los datos de
 * catalogo, SPEC 2.116.6). Una hoja de Resumen y una por sede.
 */
export async function excelDeActivos(filtros: FiltrosActivos) {
  const where = whereFiltrosActivos(filtros);

  // Se agregan assignments (para la Fecha de Entrega vigente) y
  // maintenances (para la ultima realizada y la proxima programada).
  const assets = await prisma.asset.findMany({
    where,
    include: {
      categoria: {
        select: { nombre: true },
      },
      empleadoActual: {
        select: {
          nombres: true,
          apellidoPaterno: true,
          rut: true,
          cargo: true,
          jefatura: true,
          supervisor: true,
          correoEmpresa: true,
        },
      },
      sede: {
        select: { nombre: true, codigo: true },
      },
      assignments: {
        where: { activo: true },
        select: { fechaEntrega: true },
        take: 1,
      },
      maintenances: {
        select: { fechaProgramada: true, fechaRealizada: true, estado: true },
      },
    },
    orderBy: [{ sede: { nombre: "asc" } }, { categoria: { nombre: "asc" } }, { marca: "asc" }],
  });

  function filaExcel(asset: (typeof assets)[number]): Record<string, string | number> {
    const asignacionVigente = asset.assignments[0];

    // Ultima mantencion realizada = la fecha "fechaRealizada" mas
    // reciente entre las mantenciones que ya se completaron.
    const realizadas = asset.maintenances
      .filter((m) => m.fechaRealizada)
      .map((m) => m.fechaRealizada as Date)
      .sort((a, b) => b.getTime() - a.getTime());
    const ultimaMantencionRealizada = realizadas[0] || null;

    // Proxima mantencion programada = la fecha "fechaProgramada" mas
    // cercana entre las que siguen pendientes.
    const programadas = asset.maintenances
      .filter((m) => m.estado === "pendiente" && m.fechaProgramada)
      .map((m) => m.fechaProgramada as Date)
      .sort((a, b) => a.getTime() - b.getTime());
    const proximaMantencionProgramada = programadas[0] || null;

    return {
      numeroSerie: asset.numeroSerie || "",
      nombreEquipo: asset.nombreEquipo || "",
      categoria: asset.categoria.nombre,
      marca: asset.marca,
      modelo: asset.modelo,
      imei: asset.imei || "",
      numeroTelefono: asset.numeroTelefono || "",
      numeroActivacion: asset.numeroActivacion || "",
      tipoPlan: asset.tipoPlan || "",
      sede: asset.sede?.nombre || "",
      estado: ESTADO_ACTIVO_LABEL[asset.estado] || asset.estado,
      condicion: CONDICION_ACTIVO_LABEL[asset.condicion] || asset.condicion,
      ubicacionFisica: asset.ubicacionFisica || "",
      asignadoA: asset.empleadoActual
        ? `${asset.empleadoActual.nombres} ${asset.empleadoActual.apellidoPaterno}`
        : "",
      rutAsignado: asset.empleadoActual?.rut || "",
      cargoAsignado: asset.empleadoActual?.cargo || "",
      jefatura: asset.empleadoActual?.jefatura || "",
      supervisor: asset.empleadoActual?.supervisor || "",
      correoEmpresa: asset.empleadoActual?.correoEmpresa || "",
      fechaEntrega: asignacionVigente?.fechaEntrega ? formatearFecha(asignacionVigente.fechaEntrega) : "",
      procesador: asset.procesador || "",
      ram: asset.ram || "",
      discoDuro: asset.discoDuro || "",
      sistemaOperativo: asset.sistemaOperativo || "",
      pulgadas: asset.pulgadas ? Number(asset.pulgadas) : "",
      conectividad: asset.conectividad || "",
      tieneCargador: asset.tieneCargador ? "Sí" : "No",
      microsoft365: asset.microsoft365 ? "Sí" : "No",
      licenciaMicrosoft365: asset.tipoLicenciaMicrosoft365 || "",
      intuneEnrolled: asset.intuneEnrolled ? "Sí" : "No",
      listaDistribucion: asset.listaDistribucion || "",
      antivirus: asset.antivirus || "",
      ultimaMantencionRealizada: ultimaMantencionRealizada ? formatearFecha(ultimaMantencionRealizada) : "",
      proximaMantencionProgramada: proximaMantencionProgramada ? formatearFecha(proximaMantencionProgramada) : "",
      fechaCompra: asset.fechaCompra ? formatearFecha(asset.fechaCompra) : "",
      finGarantia: asset.fechaGarantiaFin ? formatearFecha(asset.fechaGarantiaFin) : "",
      fechaBaja: asset.fechaBaja ? formatearFecha(asset.fechaBaja) : "",
      fechaVenta: asset.fechaVenta ? formatearFecha(asset.fechaVenta) : "",
      fechaCreacion: formatearFecha(asset.createdAt),
      incidencia: asset.incidencia || "",
      observaciones: asset.observaciones || "",
    };
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema de Inventario IT";
  workbook.created = new Date();

  // Hoja de Resumen (siempre primero): conteo por Sede y Estado, para ver
  // de un vistazo el total sin armar una tabla dinamica en Excel.
  const sedesUnicas = [...new Set(assets.map((a) => a.sede?.nombre || "(sin sede)"))].sort();
  const estadosUnicos = Object.values(ESTADO_ACTIVO_LABEL);
  const resumenFilas = sedesUnicas.map((nombreSede) => {
    const activosDeLaSede = assets.filter((a) => (a.sede?.nombre || "(sin sede)") === nombreSede);
    const fila: Record<string, string | number> = { sede: nombreSede, total: activosDeLaSede.length };
    for (const estadoLabel of estadosUnicos) {
      const claveEstado = Object.entries(ESTADO_ACTIVO_LABEL).find(([, v]) => v === estadoLabel)?.[0];
      fila[estadoLabel] = activosDeLaSede.filter((a) => a.estado === claveEstado).length;
    }
    return fila;
  });
  const totalGeneral: Record<string, string | number> = { sede: "TOTAL", total: assets.length };
  for (const estadoLabel of estadosUnicos) {
    const claveEstado = Object.entries(ESTADO_ACTIVO_LABEL).find(([, v]) => v === estadoLabel)?.[0];
    totalGeneral[estadoLabel] = assets.filter((a) => a.estado === claveEstado).length;
  }
  resumenFilas.push(totalGeneral);

  const columnasResumenDef = columnasResumen(estadosUnicos).map((c) => ({
    ...c,
    key: c.key === "Sede" ? "sede" : c.key === "Total" ? "total" : c.key,
  }));
  crearHojaConEstilo(workbook, "Resumen", columnasResumenDef, resumenFilas);

  // Una hoja por Sede, en orden alfabetico, con nombres unicos y validos
  // para Excel (max 31 caracteres, sin \ / ? * [ ]).
  const nombresUsados = new Set<string>(["Resumen"]);
  for (const nombreSede of sedesUnicas) {
    const activosDeLaSede = assets.filter((a) => (a.sede?.nombre || "(sin sede)") === nombreSede);
    const filas = activosDeLaSede.map((asset) => filaExcel(asset));

    let nombreHoja = nombreDeHoja(nombreSede);
    let sufijo = 2;
    while (nombresUsados.has(nombreHoja)) {
      nombreHoja = nombreDeHoja(`${nombreSede} (${sufijo})`);
      sufijo++;
    }
    nombresUsados.add(nombreHoja);

    crearHojaConEstilo(workbook, nombreHoja, COLUMNAS, filas);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, nombreArchivo: `inventario_activos_${hoyISO()}.xlsx` };
}
