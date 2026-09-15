/**
 * Formato de fechas del sistema (15-sep-2026, QA funcional, SPEC 2.38).
 *
 * EL PROBLEMA QUE RESUELVE: las fechas "de calendario" (fecha de factura,
 * de entrega, de compra, fin de garantia, proxima mantencion, fecha de
 * ingreso...) se guardan como medianoche UTC -- por ejemplo, el 15 de
 * septiembre queda almacenado como `2026-09-15T00:00:00.000Z`. Chile esta
 * en UTC-3 / UTC-4, asi que esa misma marca de tiempo, interpretada en la
 * zona horaria del navegador, cae a las 21:00 del DIA ANTERIOR. Con el
 * formato por defecto (`new Date(x).toLocaleDateString("es-CL")`) la
 * pantalla mostraba "14 de septiembre" para una factura del 15.
 *
 * Estaba repetido en 30 archivos, sin ningun punto comun donde arreglarlo,
 * asi que todo el sistema mostraba un dia menos en todas las fechas.
 *
 * LA REGLA: hay dos tipos de fecha en el sistema y NO se formatean igual.
 *
 *   1. Fecha de calendario (`formatearFecha`): representa un dia, sin hora.
 *      Se guarda a medianoche UTC, asi que se debe LEER en UTC -- si no,
 *      corre un dia. Es el caso de casi todos los campos `fecha*` del
 *      dominio, que los llena una persona eligiendo un dia en un calendario.
 *
 *   2. Marca de tiempo real (`formatearFechaHora`): un instante exacto que
 *      genero el sistema (`createdAt`, `updatedAt`, `ultimoLogin`, la hora
 *      de un evento de auditoria). Aca SI corresponde mostrarlo en la hora
 *      local de quien mira, porque el dato es un momento, no un dia.
 *
 * Si dudas cual usar: si la persona la eligio de un calendario, es la 1.
 */

type ValorFecha = Date | string | number | null | undefined;

/** Convierte a Date, o null si el valor no sirve (vacio o invalido). */
function aDate(valor: ValorFecha): Date | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return isNaN(fecha.getTime()) ? null : fecha;
}

/**
 * Fecha de calendario (sin hora), leida en UTC para que no corra un dia.
 *
 * @param valor    Fecha, string ISO, o null.
 * @param opciones Opciones extra de Intl (ej. `{ dateStyle: "long" }`).
 *                 `timeZone` se fuerza a UTC y no se puede pisar.
 * @param siVacio  Que devolver cuando no hay fecha (por defecto, "").
 */
export function formatearFecha(
  valor: ValorFecha,
  opciones: Omit<Intl.DateTimeFormatOptions, "timeZone"> = {},
  siVacio = ""
): string {
  const fecha = aDate(valor);
  if (!fecha) return siVacio;
  return fecha.toLocaleDateString("es-CL", { ...opciones, timeZone: "UTC" });
}

/**
 * Fecha de calendario en formato largo: "15 de septiembre de 2026".
 */
export function formatearFechaLarga(valor: ValorFecha, siVacio = ""): string {
  return formatearFecha(
    valor,
    { day: "numeric", month: "long", year: "numeric" },
    siVacio
  );
}

/**
 * Marca de tiempo real (createdAt, ultimoLogin, eventos de auditoria):
 * se muestra en la hora local de quien mira, con fecha y hora.
 */
export function formatearFechaHora(
  valor: ValorFecha,
  opciones: Intl.DateTimeFormatOptions = {},
  siVacio = ""
): string {
  const fecha = aDate(valor);
  if (!fecha) return siVacio;
  return fecha.toLocaleString("es-CL", opciones);
}

/**
 * Fecha de calendario para un archivo Excel/CSV o un nombre de archivo:
 * "15-09-2026". Misma regla de UTC que `formatearFecha`.
 */
export function formatearFechaCorta(valor: ValorFecha, siVacio = ""): string {
  return formatearFecha(
    valor,
    { day: "2-digit", month: "2-digit", year: "numeric" },
    siVacio
  );
}

/**
 * Fecha de calendario en formato ISO (YYYY-MM-DD), para llenar un
 * `<input type="date">` sin que corra un dia.
 */
export function aValorInputDate(valor: ValorFecha, siVacio = ""): string {
  const fecha = aDate(valor);
  if (!fecha) return siVacio;
  return fecha.toISOString().slice(0, 10);
}
