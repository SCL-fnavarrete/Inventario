/** @jest-environment node */
import ExcelJS from 'exceljs';
import { guiaDeActivos, guiaDeHistorial, mapeoSugerido } from '@/modules/importacion';
import { plantillaExcel } from '@/modules/importacion/servidor';
import { guiaDeLineas } from '@/modules/lineas';

// SPEC 2.133: la plantilla descargable usa los encabezados que el importador reconoce.
const abrir = async (buffer: Buffer) => {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  return libro;
};

test('la plantilla de monitores trae los encabezados de la guía, un ejemplo y la hoja LEEME', async () => {
  const guia = guiaDeActivos('monitor', 'Monitor');
  const libro = await abrir(await plantillaExcel(guia));
  expect(libro.worksheets.map((w) => w.name)).toEqual(['Monitor', 'LEEME']);
  const hoja = libro.getWorksheet('Monitor')!;
  const encabezados = hoja.getRow(1).values as string[];
  const columnas = guia.hojas[0].columnas.map((c) => c.columna);
  expect(encabezados.slice(1)).toEqual(columnas);
  // El importador reconoce cada encabezado de su propia plantilla.
  expect(Object.values(mapeoSugerido(columnas)).sort()).toEqual([...columnas].sort());
  // Las obligatorias se distinguen y cada encabezado explica qué va en su columna.
  const serie = hoja.getCell(1, columnas.indexOf('N° Serie') + 1);
  const nota = serie.note as unknown as string | { texts?: { text: string }[] };
  expect(typeof nota === 'string' ? nota : (nota.texts ?? []).map((t) => t.text).join('')).toMatch(/^Obligatoria./);
  expect(hoja.getRow(2).getCell(columnas.indexOf('Marca') + 1).value).toBe('Dell');
  const leeme = libro.getWorksheet('LEEME')!;
  const textos = (leeme.getColumn(1).values as unknown[]).concat(leeme.getColumn(2).values as unknown[]).filter(Boolean).join(' ');
  expect(textos).toMatch(/Antes de importar/);
  expect(textos).toMatch(/Marca que no está en el catálogo/);
});

test('el historial lleva dos hojas y las líneas una; el IMEI y el RUT no se convierten en número', async () => {
  const historial = await abrir(await plantillaExcel(guiaDeHistorial()));
  expect(historial.worksheets.map((w) => w.name)).toEqual(['ENTREGAS', 'PERSONAS', 'LEEME']);
  const lineas = await abrir(await plantillaExcel(guiaDeLineas()));
  expect(lineas.worksheets.map((w) => w.name)).toEqual(['Líneas', 'LEEME']);
  const hoja = lineas.getWorksheet('Líneas')!;
  const columna = (nombre: string) => (hoja.getRow(1).values as string[]).indexOf(nombre);
  expect(hoja.getColumn(columna('IMEI')).numFmt).toBe('@');
  expect(hoja.getColumn(columna('RUT')).numFmt).toBe('@');
  expect(hoja.getColumn(columna('N° teléfono')).numFmt).toBe('@');
});
