import * as XLSX from "xlsx";

/**
 * Reglas unicas para leer un Excel de empleados.
 *
 * Las tres rutas del asistente de importacion -hojas, vista previa e
 * importacion- tenian cada una su propia copia de estas reglas, y ya habian
 * divergido: la previa conocia 9 columnas y la importacion 12, asi que el
 * usuario aprobaba una cosa y entraba otra. Y solo la importacion validaba el
 * archivo. Aqui viven una sola vez.
 */

/**
 * Tope de tamano del archivo.
 *
 * No es desconfianza hacia el archivo: es que se carga entero en memoria y se
 * convierte en objetos, que ocupan bastante mas que el archivo original. Sin
 * tope, un archivo enorme -o un video subido por error- tumba el servidor sin
 * mensaje. Con tope, el usuario recibe una explicacion.
 *
 * 25 MB son del orden de 250.000 filas de texto; una empresa de 500 personas
 * genera unos 50 KB. El limite esta muy por encima del uso real.
 */
export const MAX_ARCHIVO_BYTES = 25 * 1024 * 1024;

const TIPOS_MIME_PERMITIDOS = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/octet-stream",
];

/** Devuelve el motivo del rechazo, o null si el archivo es aceptable. */
export function validarArchivoExcel(file: File | null): string | null {
  if (!file) return "No se proporcionó archivo";
  if (file.size > MAX_ARCHIVO_BYTES) {
    const mb = Math.round(MAX_ARCHIVO_BYTES / (1024 * 1024));
    return `El archivo excede el tamaño máximo de ${mb}MB`;
  }
  const mimeOk = TIPOS_MIME_PERMITIDOS.includes(file.type);
  const extensionOk = /\.xlsx?$/i.test(file.name);
  if (!mimeOk && !extensionOk) {
    return "Solo se permiten archivos Excel (.xlsx, .xls)";
  }
  return null;
}

/**
 * Nombres de columna aceptados para cada campo. El primero que aparezca en la
 * hoja es el que se usa.
 */
export const COLUMNAS_EMPLEADO: Record<string, string[]> = {
  rut: ["RUT", "Rut", "rut", "R.U.T.", "R.U.T"],
  nombres: ["Nombre", "Nombres", "nombre", "nombres", "NOMBRE", "NOMBRES"],
  apellidoPaterno: ["Apellido P", "Apellido Paterno", "apellido_paterno", "APELLIDO P", "ApellidoP"],
  apellidoMaterno: ["Apellido M", "Apellido Materno", "apellido_materno", "APELLIDO M", "ApellidoM"],
  correo: ["Correo", "Email", "correo", "email", "CORREO", "E-mail", "E-Mail"],
  cargo: ["Cargo", "cargo", "CARGO", "Puesto"],
  jefatura: ["Jefatura", "jefatura", "JEFATURA", "Jefe"],
  supervisor: ["Supervisor", "supervisor", "SUPERVISOR"],
  ubicacion: ["Ubicación", "Ubicacion", "ubicacion", "UBICACION", "Lugar", "Ciudad"],
  tipoContrato: ["Tipo Contrato", "TipoContrato", "tipo_contrato", "TIPO CONTRATO", "Contrato"],
  fechaIngreso: ["Fecha Ingreso", "FechaIngreso", "fecha_ingreso", "FECHA INGRESO", "Ingreso"],
  telefonoContacto: ["Teléfono", "Telefono", "telefono", "TELEFONO", "Celular", "Fono"],
};

/**
 * Valor de la primera columna que exista y tenga contenido.
 *
 * `undefined` significa "esta columna no viene en el archivo, o su celda esta
 * vacia". La importacion nunca borra un dato que el archivo no trae.
 */
export function valorColumna(
  row: Record<string, unknown>,
  mappings: string[]
): string | undefined {
  for (const mapping of mappings) {
    const bruto = row[mapping];
    if (bruto === undefined || bruto === null) continue;
    const valor = String(bruto).trim();
    if (valor !== "") return valor;
  }
  return undefined;
}

/** Valor crudo de una columna, sin convertir a texto (las fechas de Excel son numeros). */
export function valorCrudo(
  row: Record<string, unknown>,
  mappings: string[]
): unknown {
  const clave = Object.keys(row).find((k) => mappings.includes(k));
  return clave === undefined ? undefined : row[clave];
}

/**
 * Lee el libro sin dejar que SheetJS interprete las fechas: con `raw` la
 * libreria entrega el contenido tal cual y la interpretacion la hace nuestro
 * parseador, que sabe leer el formato chileno.
 */
export function leerLibro(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: "array", raw: true });
}

/** Filas de una hoja como objetos, con las celdas vacias presentes. */
export function leerFilas(
  workbook: XLSX.WorkBook,
  sheetName?: string
): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
}
