import * as XLSX from "xlsx";
import { convertExcelDateValue } from "@/lib/excel-utils";
import { MAX_FILAS, validarCantidadFilas } from "@/lib/importacion/validarArchivo";

// Filas de inicio conocidas por categoría. Todas usan fila 0 (primera fila)
// como encabezado por defecto.
const HEADER_ROWS: Record<string, number> = {
  notebook: 0,
  celular: 0,
  monitor: 0,
  epp: 0,
  otro: 0,
  desvinculaciones: 0,
  default: 0,
};

export interface FilaExcel {
  /** Numero de fila en Excel (1-indexed), para mostrarselo al usuario. */
  rowNum: number;
  /** Snapshot de todos los campos mapeados de esta fila, ya leidos y con las
   * fechas convertidas -- lo unico que necesita procesarFila() para validar
   * o escribir la fila, sin volver a tocar el archivo. */
  data: Record<string, string>;
}

/**
 * Parsea el Excel y devuelve, para cada fila con datos, el snapshot de sus
 * campos mapeados. Antes esta logica (leer el workbook, encontrar el indice
 * de cada columna mapeada, convertir fechas) vivia duplicada entre la
 * importacion directa y la vista previa -- unificarla aqui es lo que
 * garantiza que ambas vean exactamente la misma fila.
 */
export function leerFilasExcel(
  buffer: ArrayBuffer,
  sheetName: string,
  categoria: string,
  mapping: Record<string, string>
): { headers: string[]; filas: FilaExcel[] } {
  // raw: true impide que SheetJS interprete por su cuenta las celdas que
  // "parecen" fecha. El parseo lo hace convertExcelDateValue, que conoce el
  // formato chileno dd-mm-aaaa y el serial numerico de Excel.
  const headerRow = HEADER_ROWS[categoria?.toLowerCase()] ?? HEADER_ROWS.default;
  // sheetRows corta la lectura en SheetJS: una hoja de cientos de miles de
  // filas no se carga entera en memoria. Se lee una fila de mas para saber
  // si el archivo se pasa del limite y rechazarlo, en vez de truncarlo.
  const workbook = XLSX.read(buffer, {
    type: "array",
    raw: true,
    sheetRows: headerRow + 1 + MAX_FILAS + 1,
  });
  const worksheet = workbook.Sheets[sheetName];

  const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const headers = (jsonData[headerRow] as string[]) ?? [];
  const dataRows = jsonData.slice(headerRow + 1).filter((row) =>
    row.some((cell) => cell !== "" && cell !== null && cell !== undefined)
  );
  validarCantidadFilas(dataRows.length);

  const columnIndex: Record<string, number> = {};
  Object.entries(mapping).forEach(([field, header]) => {
    if (header) {
      const idx = headers.findIndex((h) => h && String(h).trim() === header);
      if (idx !== -1) columnIndex[field] = idx;
    }
  });

  const filas: FilaExcel[] = dataRows.map((row, i) => {
    const rowArray = row as string[];
    const rowNum = headerRow + i + 2; // 1-indexed, contando el encabezado

    const getValue = (field: string): string => {
      const idx = columnIndex[field];
      if (idx === undefined) return "";
      const value = rowArray[idx];
      if (value === null || value === undefined) return "";

      if (
        field.toLowerCase().includes("fecha") ||
        field === "mantencion" ||
        field === "proximaMantencion"
      ) {
        return convertExcelDateValue(value);
      }

      return String(value).trim();
    };

    const data: Record<string, string> = {};
    Object.keys(mapping).forEach((campo) => {
      data[campo] = getValue(campo);
    });

    return { rowNum, data };
  });

  return { headers, filas };
}
