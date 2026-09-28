import ExcelJS from "exceljs";

/**
 * Arma un .xlsx en memoria para las pruebas de importacion: una hoja con las
 * filas dadas (la primera suele ser el encabezado). Una celda puede ser un
 * valor simple o cualquier valor de exceljs (fecha, formula, texto con formato).
 */
export async function crearExcel(filas: ExcelJS.CellValue[][], nombreHoja = "Hoja1"): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(nombreHoja);
  filas.forEach((fila) => hoja.addRow(fila));
  const bytes = await libro.xlsx.writeBuffer();
  return new Uint8Array(bytes).buffer;
}
