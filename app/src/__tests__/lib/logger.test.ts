/** @jest-environment node */
import { logger } from "@/lib/logger";

// Auditoria 27-sep-2026, 2.7: en produccion los errores dejan rastro, en JSON.
const env = process.env as Record<string, string | undefined>;
const original = env.NODE_ENV;
const espias = {
  error: jest.spyOn(console, "error").mockImplementation(() => {}),
  warn: jest.spyOn(console, "warn").mockImplementation(() => {}),
  info: jest.spyOn(console, "info").mockImplementation(() => {}),
  log: jest.spyOn(console, "log").mockImplementation(() => {}),
};

afterEach(() => {
  env.NODE_ENV = original;
  Object.values(espias).forEach((e) => e.mockClear());
});
afterAll(() => Object.values(espias).forEach((e) => e.mockRestore()));

describe("logger en producción", () => {
  beforeEach(() => {
    env.NODE_ENV = "production";
  });

  test("error escribe una línea JSON con el error serializado", () => {
    const falla = Object.assign(new Error("se cayó"), { code: "P2002" });
    logger.error("No se pudo guardar", falla);

    const linea = JSON.parse(espias.error.mock.calls[0][0] as string);
    expect(linea).toMatchObject({
      nivel: "error",
      mensaje: "No se pudo guardar",
      detalle: { nombre: "Error", mensaje: "se cayó", codigo: "P2002" },
    });
    expect(linea.detalle.stack).toContain("se cayó");
    expect(Number.isNaN(Date.parse(linea.fecha))).toBe(false);
  });

  test("warn también se escribe, sin detalle si no lo hay", () => {
    logger.warn("Algo raro");
    const linea = JSON.parse(espias.warn.mock.calls[0][0] as string);
    expect(linea).toMatchObject({ nivel: "warn", mensaje: "Algo raro" });
    expect(linea).not.toHaveProperty("detalle");
  });

  test("info y log no se escriben", () => {
    logger.info("hola");
    logger.log("hola");
    expect(espias.info).not.toHaveBeenCalled();
    expect(espias.log).not.toHaveBeenCalled();
  });

  test("un dato circular no rompe el registro", () => {
    const circular: Record<string, unknown> = {};
    circular.yo = circular;
    expect(() => logger.error("circular", circular)).not.toThrow();
    expect(JSON.parse(espias.error.mock.calls[0][0] as string)).toMatchObject({ mensaje: "circular" });
  });
});

describe("logger en desarrollo y en tests", () => {
  test("en desarrollo escribe legible, con todos los niveles", () => {
    env.NODE_ENV = "development";
    logger.info("hola", { a: 1 });
    logger.error("mal");
    expect(espias.info).toHaveBeenCalledWith("hola", { a: 1 });
    expect(espias.error).toHaveBeenCalledWith("mal");
  });

  test("en tests no escribe nada", () => {
    env.NODE_ENV = "test";
    logger.error("mal");
    expect(espias.error).not.toHaveBeenCalled();
  });
});
