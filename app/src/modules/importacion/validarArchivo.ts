import { ApiError } from "@/shared/errores";

/**
 * Limites de la importacion de activos (auditoria 27-sep-2026, 2.4). Antes
 * /sheets leia cualquier archivo sin revisar nada y /preview lo aceptaba si
 * el tipo MIME *o* el nombre parecian Excel; un archivo grande o disfrazado
 * llegaba igual a la lectura y podia dejar la funcion sin memoria.
 */
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_FILAS = 5000;
/** Filas que la pantalla manda en cada POST a /batch. */
export const FILAS_POR_TANDA = 200;

const EXTENSION_XLSX = /\.xlsx$/i;
const EXTENSION_XLS = /\.xls$/i;

// Primeros bytes de un .xlsx: es un ZIP ("PK\x03\x04"). La extension la
// elige quien sube el archivo; la firma no.
const FIRMA_XLSX = [0x50, 0x4b, 0x03, 0x04];

export const MENSAJE_XLS =
  "El formato .xls (Excel 97-2003) no se acepta: ábrelo en Excel y guárdalo como .xlsx.";

function empiezaCon(bytes: Uint8Array, firma: number[]): boolean {
  return firma.every((b, i) => bytes[i] === b);
}

/**
 * Revisa el archivo subido y devuelve su contenido. Lanza ApiError (400 o
 * 413) si falta, esta vacio, pesa mas de 5 MB o no es un Excel real.
 */
export async function validarArchivoExcel(archivo: FormDataEntryValue | null): Promise<ArrayBuffer> {
  if (!archivo || typeof archivo === "string") {
    throw new ApiError(400, "No se proporcionó archivo");
  }
  if (archivo.size === 0) {
    throw new ApiError(400, "El archivo está vacío");
  }
  if (archivo.size > MAX_BYTES) {
    throw new ApiError(413, "El archivo excede el tamaño máximo de 5 MB");
  }
  // Solo .xlsx: la lectura usa exceljs, que no lee el formato antiguo .xls
  // (auditoria 28-sep-2026, 3.4).
  if (EXTENSION_XLS.test(archivo.name)) throw new ApiError(400, MENSAJE_XLS);
  if (!EXTENSION_XLSX.test(archivo.name)) {
    throw new ApiError(400, "Solo se permiten archivos Excel (.xlsx)");
  }

  const buffer = await archivo.arrayBuffer();
  const inicio = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (!empiezaCon(inicio, FIRMA_XLSX)) {
    throw new ApiError(400, "El archivo no es un Excel válido");
  }
  return buffer;
}

/** Rechaza una importacion con mas filas de las permitidas. */
export function validarCantidadFilas(cantidad: number): void {
  if (cantidad > MAX_FILAS) {
    throw new ApiError(
      400,
      `El archivo tiene más de ${MAX_FILAS.toLocaleString("es-CL")} filas. Divídelo en partes más chicas.`
    );
  }
}
