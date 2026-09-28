import { ApiError } from "@/lib/errors";

/**
 * Limites de la importacion de activos (auditoria 27-sep-2026, 2.4). Antes
 * /sheets leia cualquier archivo sin revisar nada y /preview lo aceptaba si
 * el tipo MIME *o* el nombre parecian Excel; un archivo grande o disfrazado
 * llegaba igual a SheetJS y podia dejar la funcion sin memoria.
 */
export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_FILAS = 5000;
/** Filas que la pantalla manda en cada POST a /batch. */
export const FILAS_POR_TANDA = 200;

const EXTENSION_EXCEL = /\.xlsx?$/i;

// Primeros bytes de cada formato: .xlsx es un ZIP ("PK\x03\x04") y .xls un
// documento OLE2 (D0 CF 11 E0). La extension la elige quien sube el archivo;
// la firma no.
const FIRMA_XLSX = [0x50, 0x4b, 0x03, 0x04];
const FIRMA_XLS = [0xd0, 0xcf, 0x11, 0xe0];

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
  if (!EXTENSION_EXCEL.test(archivo.name)) {
    throw new ApiError(400, "Solo se permiten archivos Excel (.xlsx, .xls)");
  }

  const buffer = await archivo.arrayBuffer();
  const inicio = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  if (!empiezaCon(inicio, FIRMA_XLSX) && !empiezaCon(inicio, FIRMA_XLS)) {
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
