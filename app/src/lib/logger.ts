/**
 * Logger seguro que solo loguea en desarrollo
 * Evita exponer información sensible en producción
 */

const isDevelopment = process.env.NODE_ENV === "development";

export const logger = {
  error: (message: string, error?: unknown) => {
    if (isDevelopment) {
      console.error(message, error);
    }
  },
  warn: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.warn(message, data);
    }
  },
  info: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.info(message, data);
    }
  },
  log: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(message, data);
    }
  },
};

export default logger;
