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
 * Medianoche UTC del dia de hoy en Chile: el punto de comparacion para las
 * fechas de calendario, que se guardan a medianoche UTC. Comparar contra
 * `new Date()` marcaba como vencida una mantencion programada para hoy
 * desde la primera hora del dia.
 */
export function inicioDeHoy(): Date {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
  return new Date(`${hoy}T00:00:00Z`);
}

/**
 * Fecha de hoy en Chile como "YYYY-MM-DD", para el valor por defecto de un
 * campo de fecha o el nombre de un archivo. `new Date().toISOString()` da la
 * fecha en UTC: desde las 21:00 en Chile ya es la de manana.
 */
export function hoyISO(): string {
  return inicioDeHoy().toISOString().slice(0, 10);
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

/**
 * Fecha de calendario con su hora opcional (hora de Chile, "HH:MM"), como
 * "26-09-2026 a las 14:30". Para las mantenciones programadas (SPEC 2.98):
 * la hora va aparte de la fecha para no correr el dia.
 */
export function formatearFechaConHora(
  fecha: ValorFecha,
  hora?: string | null,
  siVacio = ""
): string {
  const texto = formatearFechaCorta(fecha, siVacio);
  return fecha && hora ? `${texto} a las ${hora}` : texto;
}

/**
 * Fecha y hora de ahora para un <input type="datetime-local">, en la hora de
 * quien usa la pantalla (SPEC 2.104). `toISOString().slice(0, 16)` daba la
 * hora de Londres: 3 horas mas en Chile.
 */
export function ahoraParaInputFechaHora(): string {
  const ahora = new Date();
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/**
 * Lo que marca un <input type="datetime-local"> ("2026-09-25T10:30", hora de
 * quien lo usa) como instante exacto para el servidor (SPEC 2.104). Mandar el
 * texto tal cual hacia que el servidor lo leyera en su propia zona horaria:
 * en produccion (UTC) una entrega a las 10:30 quedaba a las 07:30.
 */
export function inputFechaHoraAISO(valor: string): string | undefined {
  if (!valor) return undefined;
  const fecha = new Date(valor);
  return isNaN(fecha.getTime()) ? undefined : fecha.toISOString();
}

/**
 * Instante en que empieza un dia en Chile ("2026-09-25" -> 00:00 hora de
 * Chile, en UTC). Para filtrar marcas de tiempo por dia (Registro de
 * accesos, Auditoria): new Date("2026-09-25") es medianoche de Londres, 3 o 4
 * horas antes. Chile esta en UTC-3 o UTC-4 segun la epoca del año.
 */
export function inicioDiaChile(dia: string): Date {
  for (const desfase of ["-03:00", "-04:00"]) {
    const instante = new Date(`${dia}T00:00:00${desfase}`);
    const hora = instante.toLocaleTimeString("en-GB", { timeZone: "America/Santiago", hour12: false });
    if (hora.startsWith("00:00")) return instante;
  }
  return new Date(`${dia}T00:00:00-03:00`);
}

/**
 * Rango [desde, hasta] de dias en Chile para filtrar marcas de tiempo:
 * "hasta" incluye todo ese dia (hasta antes de que empiece el siguiente).
 */
export function rangoDiasChile(desde?: string | null, hasta?: string | null) {
  const rango: { gte?: Date; lt?: Date } = {};
  if (desde) rango.gte = inicioDiaChile(desde);
  if (hasta) {
    const siguiente = new Date(`${hasta}T12:00:00Z`);
    siguiente.setUTCDate(siguiente.getUTCDate() + 1);
    rango.lt = inicioDiaChile(siguiente.toISOString().slice(0, 10));
  }
  return Object.keys(rango).length > 0 ? rango : undefined;
}
