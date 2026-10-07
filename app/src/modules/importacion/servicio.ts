import { quienHace, type SesionAutenticada } from '@/shared/auth/guard';
import { prisma } from '@/shared/prisma';
import { logger } from '@/shared/logger';
import { ValidationError } from '@/shared/errores';
import {
  buscarCategoriaPorNombre,
  categoriaParaImportar,
  crearOpcion,
  type ClaveCatalogo,
} from '@/modules/activos/servidor';
import { tipoMantencionImportada } from '@/modules/mantenciones/servidor';
import { armarContextoImportacion } from '@/modules/importacion/contexto';
import { leerFilasExcel, leerHoja, mapearFilas } from '@/modules/importacion/leerExcel';
import { procesarFila } from '@/modules/importacion/procesarFila';
import { validarCantidadFilas } from '@/modules/importacion/validarArchivo';
import type {
  CorrectedRow,
  ImportBatchResult,
  ImportPreviewResult,
  ImportRowStatus,
} from '@/modules/importacion/tipos';


/**
 * Vista previa de un Excel (POST /api/activos/importar/preview). Sin mapeo
 * todavia (recien se subio el archivo) devuelve solo los encabezados y las
 * primeras filas, para armar el mapeo. Con mapeo, valida todas las filas con
 * procesarFila en modo dryRun: las mismas reglas que la importacion real,
 * sin escribir nada.
 */
export async function vistaPreviaImportacion(p: {
  buffer: ArrayBuffer;
  sheetName: string;
  categoria: string;
  mapping: Record<string, string> | null;
  /** Correcciones hechas a mano en el panel de errores, por rowIndex: revalidar no las pisa. */
  corrections: Record<number, Record<string, string>>;
  sedeId: string | null;
  session: SesionAutenticada;
}) {
  if (!p.mapping) {
    // La hoja se lee una sola vez. Sin mapeo aun, cada columna se usa como su
    // propio campo, solo para mostrar la estructura.
    const hoja = await leerHoja(p.buffer, p.sheetName);
    const mappingIdentidad: Record<string, string> = {};
    hoja.headers.forEach((h) => {
      if (h) mappingIdentidad[h] = h;
    });
    const primeras = mapearFilas({ ...hoja, filas: hoja.filas.slice(0, 100) }, mappingIdentidad);
    const rows = primeras.map((f) => hoja.headers.map((h) => f.data[h] ?? ''));
    return { headers: hoja.headers, rows, totalRows: hoja.filas.length };
  }

  const mapping = p.mapping;
  if (!mapping.marca || !mapping.modelo) throw new ValidationError('Faltan campos requeridos en el mapeo');

  // La vista previa no crea la categoria: si no existe, se crea al confirmar.
  const categoria = await buscarCategoriaPorNombre(p.categoria);
  // La columna que identifica al equipo: IMEI en celulares, N° de serie en
  // los demas (SPEC 2.112.7).
  if (categoria?.tipoFicha === 'celular' ? !mapping.imei : !mapping.numeroSerie) {
    throw new ValidationError('Faltan campos requeridos en el mapeo');
  }

  const { headers, filas } = await leerFilasExcel(p.buffer, p.sheetName, mapping);
  const datosFilas = filas.map((fila, i) =>
    p.corrections[i] ? { ...fila.data, ...p.corrections[i] } : fila.data
  );
  const ctx = await armarContextoImportacion({
    session: p.session,
    sedeIdSolicitada: p.sedeId,
    filas: datosFilas,
    categoriaId: categoria?.id ?? '',
    exigeImei: categoria?.tipoFicha === 'celular',
    tipoMantencionId: '',
  });

  const rows: ImportRowStatus[] = [];
  for (const fila of filas) {
    const resultado = await procesarFila(datosFilas[rows.length], ctx, prisma, true);
    rows.push({
      rowIndex: rows.length,
      excelRow: fila.rowNum,
      status: resultado.status === 'error' ? 'error' : 'valid',
      data: resultado.data,
      errors:
        resultado.status === 'error'
          ? [{ type: resultado.tipo, field: resultado.campo, message: resultado.mensaje }]
          : [],
      warnings: [],
      persona: resultado.status === 'valid' ? resultado.persona : undefined,
      sinSede: resultado.status === 'valid' ? resultado.sinSede : undefined,
      activoSinPersona: resultado.status === 'valid' ? resultado.activoSinPersona : undefined,
      disponibleConPersona: resultado.status === 'valid' ? resultado.disponibleConPersona : undefined,
    });
  }
  const personas = rows.flatMap((r) => (r.persona ? [r.persona] : []));

  const conError = (tipo: string) =>
    rows.filter((r) => r.errors.some((e) => e.type === tipo)).map((r) => r.data.numeroSerie || '');
  const resultado: ImportPreviewResult = {
    headers,
    rows,
    totalRows: rows.length,
    validCount: rows.filter((r) => r.status === 'valid').length,
    errorCount: rows.filter((r) => r.status === 'error').length,
    warningCount: 0,
    duplicatesInFile: conError('duplicate_in_file'),
    duplicatesInDb: conError('duplicate_in_database'),
    personas: {
      nuevasActivas: personas.filter((p) => p.accion === 'nueva' && p.estado === 'activo').length,
      nuevasDesvinculadas: personas.filter((p) => p.accion === 'nueva' && p.estado === 'desvinculado').length,
      existentes: personas.filter((p) => p.accion === 'existente').length,
      porNombre: personas.filter((p) => p.porNombre).length,
    },
    sinSede: rows.filter((r) => r.sinSede).length,
    activosSinPersona: rows.filter((r) => r.activoSinPersona).length,
    disponiblesConPersona: rows.filter((r) => r.disponibleConPersona).length,
  };
  return resultado;
}

/**
 * Importa una tanda (POST /api/activos/importar/batch): unico punto donde la
 * importacion escribe. Procesa las filas validas y las corregidas con
 * procesarFila(dryRun=false), las mismas reglas que aprobo la vista previa.
 */
export async function importarTanda(
  p: { categoria: string; rows: CorrectedRow[]; sedeId?: string },
  session: SesionAutenticada
) {
  if (!p.categoria || !Array.isArray(p.rows) || p.rows.length === 0) {
    throw new ValidationError('Faltan parámetros requeridos');
  }
  // La pantalla manda tandas acotadas; esto protege de un POST enorme armado a mano.
  validarCantidadFilas(p.rows.length);

  const categoria = await categoriaParaImportar(p.categoria);
  const tipoMantencion = await tipoMantencionImportada();
  const ctx = await armarContextoImportacion({
    session,
    sedeIdSolicitada: p.sedeId,
    filas: p.rows.map((row) => row.data ?? {}),
    categoriaId: categoria.id,
    exigeImei: categoria.tipoFicha === 'celular',
    tipoMantencionId: tipoMantencion.id,
  });

  const results: ImportRowStatus[] = [];
  for (const row of p.rows) {
    const resultado = await procesarFila(row.data, ctx, prisma, false).catch((error) => ({
      status: 'error' as const,
      tipo: 'unknown_error' as const,
      mensaje: error instanceof Error ? error.message : 'Error desconocido',
      data: row.data,
      campo: undefined as string | undefined,
    }));
    results.push(
      resultado.status === 'error'
        ? {
            rowIndex: row.rowIndex,
            excelRow: row.rowIndex + 2,
            status: 'error',
            data: resultado.data,
            errors: [{ type: resultado.tipo, field: resultado.campo, message: resultado.mensaje }],
            warnings: [],
          }
        : {
            rowIndex: row.rowIndex,
            excelRow: row.rowIndex + 2,
            status: 'imported',
            data: resultado.data,
            errors: [],
            warnings: [],
            assetId: resultado.status === 'imported' ? resultado.assetId : undefined,
            persona: resultado.status === 'imported' ? resultado.persona : undefined,
          }
    );
  }

  await completarCatalogos(results, quienHace(session));

  const respuesta: ImportBatchResult = {
    success: results.every((r) => r.status === 'imported'),
    imported: results.filter((r) => r.status === 'imported').length,
    skipped: 0,
    failed: results.filter((r) => r.status === 'error').length,
    results,
  };
  return respuesta;
}

/**
 * Sistema operativo, antivirus y licencia M365 son texto en el equipo, pero
 * tambien alimentan un catalogo administrable. Despues de escribir los
 * equipos se agregan ahi los valores nuevos de la tanda, con la misma regla
 * del "+ Agregar opcion" (crearOpcion: sin duplicar sin importar mayusculas,
 * reactiva una desactivada). Es lo mejor posible: si falla, los equipos ya
 * importados quedan igual y el catalogo se completa despues a mano.
 */
async function completarCatalogos(results: ImportRowStatus[], usuario: string | null | undefined) {
  const catalogos: [ClaveCatalogo, 'sistemaOperativo' | 'antivirus' | 'microsoft365'][] = [
    ['sistemas-operativos', 'sistemaOperativo'],
    ['antivirus', 'antivirus'],
    ['licencias-m365', 'microsoft365'],
  ];
  const importadas = results.filter((r) => r.status === 'imported');
  try {
    for (const [clave, campo] of catalogos) {
      const nombres = new Set(importadas.map((r) => (r.data[campo] || '').trim()).filter(Boolean));
      for (const nombre of nombres) await crearOpcion(clave, nombre, usuario);
    }
  } catch (error) {
    logger.error('No se pudieron completar las opciones de catalogo tras la importacion', error);
  }
}
