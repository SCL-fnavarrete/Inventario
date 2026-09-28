/**
 * Logger del servidor (auditoria 27-sep-2026, 2.7).
 *
 * Antes solo escribia en desarrollo: en produccion un error no dejaba ningun
 * rastro. Ahora:
 * - `error` y `warn` se escriben siempre. En produccion como una linea JSON
 *   (nivel, mensaje, fecha y el error con nombre, mensaje y stack), para
 *   poder buscarlos y filtrarlos en los logs de Vercel; en desarrollo,
 *   legibles en la consola.
 * - `info` y `log` solo en desarrollo.
 * En los tests no se escribe nada: los casos de error llenarian la salida.
 *
 * Nunca se le pasan cuerpos de peticion ni contrasenas: solo el mensaje y el
 * error o un dato puntual.
 */

type Nivel = "error" | "warn" | "info" | "log";

const entorno = () => process.env.NODE_ENV;

/** Error -> objeto plano que JSON.stringify si sabe escribir. */
function serializar(dato: unknown): unknown {
  if (dato instanceof Error) {
    return {
      nombre: dato.name,
      mensaje: dato.message,
      ...("code" in dato ? { codigo: (dato as { code: unknown }).code } : {}),
      stack: dato.stack,
    };
  }
  return dato;
}

function escribir(nivel: Nivel, mensaje: string, dato?: unknown) {
  const env = entorno();
  if (env === "test") return;

  if (env === "development") {
    if (dato === undefined) console[nivel](mensaje);
    else console[nivel](mensaje, dato);
    return;
  }

  if (nivel === "info" || nivel === "log") return;
  let linea: string;
  try {
    linea = JSON.stringify({
      nivel,
      mensaje,
      fecha: new Date().toISOString(),
      ...(dato !== undefined ? { detalle: serializar(dato) } : {}),
    });
  } catch {
    // Un dato con referencias circulares no puede tumbar el registro.
    linea = JSON.stringify({ nivel, mensaje, fecha: new Date().toISOString() });
  }
  console[nivel](linea);
}

export const logger = {
  error: (message: string, error?: unknown) => escribir("error", message, error),
  warn: (message: string, data?: unknown) => escribir("warn", message, data),
  info: (message: string, data?: unknown) => escribir("info", message, data),
  log: (message: string, data?: unknown) => escribir("log", message, data),
};

export default logger;
