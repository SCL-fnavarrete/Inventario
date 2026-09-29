/**
 * Utilidades para procesamiento de datos de Excel
 */

/**
 * Convierte un número serial de Excel a objeto Date de JavaScript
 * Excel almacena las fechas como números seriales (días desde 1900-01-01)
 * Nota: Excel tiene un bug del año bisiesto 1900 que se mantiene por compatibilidad
 *
 * @param serial - Número serial de Excel (ej: 45015 = 19/04/2023)
 * @returns Objeto Date de JavaScript
 */
export function excelSerialToDate(serial: number): Date {
  // Excel cuenta desde 1900-01-01, pero JavaScript desde 1970-01-01
  // 25569 es la diferencia de días entre 1900-01-01 y 1970-01-01
  const utcDays = Math.floor(serial - 25569);
  const date = new Date(utcDays * 86400 * 1000);
  return date;
}

/**
 * Formatea una fecha al formato dd-mm-yyyy
 *
 * @param date - Objeto Date de JavaScript
 * @returns String en formato dd-mm-yyyy
 */
export function formatDateToDDMMYYYY(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Convierte un número serial de Excel directamente a formato dd-mm-yyyy
 *
 * @param serial - Número serial de Excel
 * @returns String en formato dd-mm-yyyy
 */
export function excelSerialToDDMMYYYY(serial: number): string {
  const date = excelSerialToDate(serial);
  return formatDateToDDMMYYYY(date);
}

/**
 * Detecta si un valor es un número serial de fecha de Excel
 * Los números seriales de Excel para fechas típicamente están entre:
 * - 1 (1900-01-01) y 59 (1900-02-28) - fechas tempranas
 * - 60+ para fechas posteriores a 1900-02-29
 * Para fechas relevantes (2000-2050), el rango es aproximadamente 36526 a 54787
 *
 * @param value - Valor a verificar
 * @returns true si parece ser un serial de fecha de Excel
 */
export function isExcelDateSerial(value: unknown): boolean {
  if (typeof value !== 'number') return false;
  // Rango razonable para fechas de activos: 1990-01-01 (32874) a 2050-12-31 (55152)
  return value >= 32874 && value <= 55152;
}

/**
 * Convierte un valor de celda de Excel en una fecha formateada
 * Maneja tanto números seriales como strings de fecha
 *
 * @param value - Valor de la celda de Excel
 * @returns String en formato dd-mm-yyyy o el valor original si no es fecha
 */
export function convertExcelDateValue(value: unknown): string {
  // Si es un número y parece ser un serial de fecha
  if (isExcelDateSerial(value)) {
    return excelSerialToDDMMYYYY(value as number);
  }

  // Si es un string que parece ser una fecha en formato ISO o similar
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return formatDateToDDMMYYYY(date);
      }
    } catch {
      // Si falla el parseo, devolver el valor original
    }
  }

  // Formato chileno con barras: se normaliza a guiones.
  if (typeof value === 'string' && value.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    const [dia, mes, anio] = value.split('/');
    return `${dia.padStart(2, '0')}-${mes.padStart(2, '0')}-${anio}`;
  }

  // Si ya está en formato dd-mm-yyyy, devolverlo tal cual (rellenando el dia
  // o el mes si vinieran con un solo digito).
  if (typeof value === 'string' && value.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
    const [dia, mes, anio] = value.split('-');
    return `${dia.padStart(2, '0')}-${mes.padStart(2, '0')}-${anio}`;
  }

  // Devolver el valor original convertido a string
  return String(value);
}

/**
 * Convierte una fecha en formato dd-mm-yyyy a objeto Date de JavaScript
 * Útil para guardar en la base de datos
 *
 * @param dateStr - String en formato dd-mm-yyyy
 * @returns Objeto Date o null si el formato es inválido
 */
export function parseDDMMYYYYToDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  // Se aceptan las dos formas en que un Excel chileno escribe una fecha:
  // 01-12-2024 y 01/12/2024. Antes solo se admitian guiones, asi que las
  // fechas con barras -lo mas habitual- se perdian en silencio.
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Meses en JS son 0-indexed
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

  const date = new Date(Date.UTC(year, month, day));

  // Validar que la fecha es válida
  if (isNaN(date.getTime())) return null;

  return date;
}
