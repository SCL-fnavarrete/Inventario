import ExcelJS from 'exceljs';
import type { GuiaImportacion } from '@/modules/importacion/guia';

/**
 * Plantilla descargable de una importacion (SPEC 2.133): un Excel con los
 * encabezados exactos que el importador reconoce, una fila de ejemplo y una hoja
 * LEEME con la guia. Sale de la misma `GuiaImportacion` que se muestra en la
 * pantalla, asi no puede decir otra cosa.
 */

const AZUL = 'FF1F4E78';
const GRIS = 'FFD9D9D9';
/** Columnas que Excel no debe convertir (un IMEI o una serie larga se vuelve "3,5E+14"). */
const COMO_TEXTO = /imei|serie|rut|tel[eé]fono/i;

export async function plantillaExcel(guia: GuiaImportacion): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();

  for (const hoja of guia.hojas) {
    const ws = libro.addWorksheet(hoja.nombre.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(hoja.columnas.map((c) => c.columna));
    ws.addRow(hoja.columnas.map((c) => c.ejemplo));
    hoja.columnas.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = Math.max(c.columna.length, c.ejemplo.length, 10) + 3;
      if (COMO_TEXTO.test(c.columna)) col.numFmt = '@';
      const cabecera = ws.getCell(1, i + 1);
      cabecera.font = { bold: true, color: { argb: c.obligatoria ? 'FFFFFFFF' : 'FF000000' } };
      cabecera.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.obligatoria ? AZUL : GRIS } };
      // Al pasar el mouse por el encabezado, Excel muestra que va en esa columna.
      cabecera.note = `${c.obligatoria ? 'Obligatoria. ' : 'Opcional. '}${c.descripcion}`;
      ws.getCell(2, i + 1).font = { italic: true, color: { argb: 'FF7F7F7F' } };
    });
  }

  const leeme = libro.addWorksheet('LEEME');
  leeme.columns = [{ width: 28 }, { width: 110 }];
  const titulo = (t: string) => {
    const fila = leeme.addRow([t]);
    fila.getCell(1).font = { bold: true, size: 12 };
  };
  const linea = (a: string, b = '') => {
    const fila = leeme.addRow([a, b]);
    fila.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    fila.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  };
  leeme.addRow([guia.titulo]).getCell(1).font = { bold: true, size: 14 };
  linea(guia.resumen);
  leeme.addRow([]);
  titulo('Cómo está armado este archivo');
  linea('Encabezados', 'Azul = columna obligatoria; gris = opcional. La segunda fila es un ejemplo: bórrala antes de importar. Pasa el mouse por un encabezado para ver qué va en esa columna.');
  for (const h of guia.hojas) linea(h.nombre, h.para);
  leeme.addRow([]);
  titulo('Antes de importar');
  guia.antes.forEach((a) => linea('•', a));
  leeme.addRow([]);
  titulo('Cómo se interpreta');
  guia.reglas.forEach((r) => linea('•', r));
  leeme.addRow([]);
  titulo('Errores comunes y cómo arreglarlos');
  guia.fallos.forEach((f) => linea(f.motivo, f.solucion));

  return Buffer.from(await libro.xlsx.writeBuffer());
}
