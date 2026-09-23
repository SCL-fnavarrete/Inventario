/**
 * Formato de fechas del sistema.
 *
 * Las fechas "de calendario" (factura, entrega, compra, garantia,
 * mantencion, ingreso...) se guardan como medianoche UTC. Chile esta en
 * UTC-3/UTC-4, asi que leerlas en la zona horaria local del navegador las
 * corre un dia hacia atras.
 *
 * LA REGLA: hay dos tipos de fecha en el sistema y no se formatean igual.
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
 * Fecha de calendario en formato largo (dia, mes y ano completos).
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
 * Marca de tiempo compacta (DD-MM-YYYY, HH:MM) para tablas y detalles.
 * Guias, Usuarios y Asignaciones tenian cada una su propia version.
 */
export function formatearFechaHoraCorta(valor: ValorFecha, siVacio = ""): string {
  return formatearFechaHora(
    valor,
    { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" },
    siVacio
  );
}

/**
 * Fecha de calendario en formato corto (DD-MM-YYYY), para nombres de
 * archivo o exportaciones. Misma regla de UTC que `formatearFecha`.
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
