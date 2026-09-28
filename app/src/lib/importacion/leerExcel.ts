import ExcelJS from "exceljs";
import { ApiError } from "@/lib/errors";
import { convertExcelDateValue } from "@/lib/excel-utils";
import { validarCantidadFilas } from "@/lib/importacion/validarArchivo";

/**
 * Lectura del Excel de la importacion de activos con `exceljs`, la misma
 * libreria que ya usaba la exportacion (auditoria 28-sep-2026, 3.4). Antes la
 * lectura usaba `xlsx` (SheetJS): eran dos librerias grandes para el mismo
 * formato, y la de npm estaba abandonada. `exceljs` solo lee `.xlsx`: el
 * formato antiguo `.xls` (Excel 97-2003) ya no se acepta.
 */

/** Valor simple de una celda, como lo entregaba la lectura anterior. */
export type Celda = string | number | boolean;

export interface FilaExcel {
  /** Numero de fila en Excel (1-indexed), para mostrarselo al usuario. */
  rowNum: number;
  /** Snapshot de todos los campos mapeados de esta fila, ya leidos y con las
   * fechas convertidas -- lo unico que necesita procesarFila() para validar
   * o escribir la fila, sin volver a tocar el archivo. */
  data: Record<string, string>;
}

/** Hoja leida una sola vez: encabezados y filas con datos (sin las vacias). */
export interface HojaExcel {
  headers: string[];
  filas: { rowNum: number; celdas: Celda[] }[];
}

// Dias entre el 30-12-1899 (dia 0 de Excel) y el 01-01-1970 (dia 0 de JS).
const DIAS_EXCEL_A_UNIX = 25_569;

/**
 * `exceljs` entrega objetos para algunas celdas; se dejan como el valor que
 * se ve en Excel. Las fechas vuelven a su numero de serie de Excel, que es
 * lo que convertExcelDateValue ya sabe leer (asi el resultado no cambia).
 */
export function valorDeCelda(valor: ExcelJS.CellValue): Celda {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.getTime() / 86_400_000 + DIAS_EXCEL_A_UNIX;
  if (typeof valor !== "object") return valor;
  if ("result" in valor) return valorDeCelda(valor.result as ExcelJS.CellValue); // formula
  if ("richText" in valor) return valor.richText.map((t) => t.text).join(""); // texto con formato
  if ("text" in valor) return String(valor.text); // hipervinculo
  return ""; // error de formula (#N/A, #REF!...)
}

async function abrirLibro(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    throw new ApiError(400, "No se pudo leer el archivo. Ábrelo en Excel y guárdalo como .xlsx.");
  }
  return libro;
}

/** Nombres de las hojas del libro. */
export async function nombresDeHojas(buffer: ArrayBuffer): Promise<string[]> {
  return (await abrirLibro(buffer)).worksheets.map((hoja) => hoja.name);
}

/**
 * Lee una hoja completa: el encabezado es la primera fila con datos y las
 * filas vacias se saltan. Rechaza la hoja si trae mas de MAX_FILAS filas.
 */
export async function leerHoja(buffer: ArrayBuffer, sheetName: string): Promise<HojaExcel> {
  const hoja = (await abrirLibro(buffer)).getWorksheet(sheetName);
  if (!hoja) throw new ApiError(400, `El archivo no tiene una hoja llamada "${sheetName}"`);

  const columnas = hoja.columnCount;
  const conDatos: HojaExcel["filas"] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, rowNum) => {
    const celdas: Celda[] = [];
    for (let c = 1; c <= columnas; c++) celdas.push(valorDeCelda(fila.getCell(c).value));
    if (celdas.some((v) => v !== "")) conDatos.push({ rowNum, celdas });
  });

  const [encabezado, ...filas] = conDatos;
  validarCantidadFilas(filas.length);
  return { headers: (encabezado?.celdas ?? []).map((h) => String(h)), filas };
}

/** Pasa cada fila a `{ campo: valor }` segun el mapeo campo -> encabezado. */
export function mapearFilas(hoja: HojaExcel, mapping: Record<string, string>): FilaExcel[] {
  const columnIndex: Record<string, number> = {};
  for (const [campo, encabezado] of Object.entries(mapping)) {
    if (!encabezado) continue;
    const idx = hoja.headers.findIndex((h) => h && h.trim() === encabezado);
    if (idx !== -1) columnIndex[campo] = idx;
  }

  return hoja.filas.map(({ rowNum, celdas }) => {
    const data: Record<string, string> = {};
    for (const campo of Object.keys(mapping)) {
      const idx = columnIndex[campo];
      const valor = idx === undefined ? "" : celdas[idx];
      if (valor === "" || valor === undefined) {
        data[campo] = "";
      } else if (campo.toLowerCase().includes("fecha") || campo === "mantencion" || campo === "proximaMantencion") {
        data[campo] = convertExcelDateValue(valor);
      } else {
        data[campo] = String(valor).trim();
      }
    }
    return { rowNum, data };
  });
}

/**
 * Lee la hoja y devuelve, para cada fila con datos, el snapshot de sus
 * campos mapeados. Es el unico camino de lectura de la vista previa y la
 * escritura: asi ambas ven exactamente la misma fila.
 */
export async function leerFilasExcel(
  buffer: ArrayBuffer,
  sheetName: string,
  mapping: Record<string, string>
): Promise<{ headers: string[]; filas: FilaExcel[] }> {
  const hoja = await leerHoja(buffer, sheetName);
  return { headers: hoja.headers, filas: mapearFilas(hoja, mapping) };
}
