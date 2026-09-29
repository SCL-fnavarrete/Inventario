/** @jest-environment node */
import {
  MAX_BYTES,
  MAX_FILAS,
  MENSAJE_XLS,
  validarArchivoExcel,
  validarCantidadFilas,
} from "@/modules/importacion/validarArchivo";
import { leerFilasExcel } from "@/modules/importacion/leerExcel";
import { precargarEmpleadosPorRut } from "@/modules/importacion/procesarFila";
import { interpretarRut } from "@/modules/importacion/reglasFila";
import { crearExcel } from "@/test-utils/excel";

const archivo = (contenido: BlobPart[], nombre: string) => new File(contenido, nombre);

describe("validarArchivoExcel", () => {
  it("devuelve el contenido de un .xlsx real", async () => {
    const buffer = await validarArchivoExcel(archivo([await crearExcel([["Marca"], ["Dell"]])], "inv.xlsx"));
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  // Auditoria 28-sep-2026 (3.4): la lectura usa exceljs, que no lee .xls.
  it("rechaza el formato antiguo .xls con un mensaje que dice cómo convertirlo", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(validarArchivoExcel(archivo([ole], "viejo.XLS"))).rejects.toMatchObject({
      status: 400,
      message: MENSAJE_XLS,
    });
  });

  it("rechaza cuando no llega archivo", async () => {
    await expect(validarArchivoExcel(null)).rejects.toMatchObject({ status: 400 });
    await expect(validarArchivoExcel("texto")).rejects.toMatchObject({ status: 400 });
  });

  it("rechaza un archivo vacío", async () => {
    await expect(validarArchivoExcel(archivo([], "vacio.xlsx"))).rejects.toMatchObject({
      status: 400,
      message: "El archivo está vacío",
    });
  });

  it("rechaza con 413 un archivo de más de 5 MB", async () => {
    const grande = new Uint8Array(MAX_BYTES + 1);
    await expect(validarArchivoExcel(archivo([grande], "grande.xlsx"))).rejects.toMatchObject({
      status: 413,
    });
  });

  it("rechaza otra extensión aunque el contenido sea Excel", async () => {
    await expect(
      validarArchivoExcel(archivo([await crearExcel([["Marca"]])], "inv.csv"))
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining(".xlsx") });
  });

  it("rechaza un archivo disfrazado con extensión .xlsx", async () => {
    await expect(
      validarArchivoExcel(archivo(["<html>no soy excel</html>"], "falso.xlsx"))
    ).rejects.toMatchObject({ status: 400, message: "El archivo no es un Excel válido" });
  });
});

describe("validarCantidadFilas", () => {
  it("deja pasar hasta el máximo y rechaza una fila más", () => {
    expect(() => validarCantidadFilas(MAX_FILAS)).not.toThrow();
    expect(() => validarCantidadFilas(MAX_FILAS + 1)).toThrow(/más de/);
  });
});

describe("leerFilasExcel con tope de filas", () => {
  const encabezado = ["Marca", "Modelo"];
  const filas = (n: number) => Array.from({ length: n }, (_, i) => ["Dell", `M${i}`]);

  it("lee un archivo justo en el límite", async () => {
    const buffer = await crearExcel([encabezado, ...filas(MAX_FILAS)]);
    const { filas: leidas } = await leerFilasExcel(buffer, "Hoja1", { marca: "Marca" });
    expect(leidas).toHaveLength(MAX_FILAS);
  });

  it("rechaza un archivo que se pasa del límite en vez de truncarlo", async () => {
    const buffer = await crearExcel([encabezado, ...filas(MAX_FILAS + 10)]);
    await expect(leerFilasExcel(buffer, "Hoja1", { marca: "Marca" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("precargarEmpleadosPorRut", () => {
  const rutA = (interpretarRut("11.111.111-1") as { rut: string }).rut;
  const rutB = (interpretarRut("12345678-5") as { rut: string }).rut;

  it("busca solo RUT válidos, sin repetir, y arma el caché rut -> id", async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: "e-1", rut: rutA, estado: "activo" }]);
    const { employeeCache, empleadosDesvinculados } = await precargarEmpleadosPorRut(
      ["11111111-1", "11.111.111-1", "12.345.678-5", "", "123-4"],
      { employee: { findMany } } as never
    );

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.rut.in.sort()).toEqual([rutA, rutB].sort());
    expect(employeeCache.get(rutA)).toBe("e-1");
    expect(employeeCache.has(rutB)).toBe(false);
    expect(empleadosDesvinculados.size).toBe(0);
  });

  it("anota qué RUT están desvinculados", async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: "e-1", rut: rutA, estado: "desvinculado" },
      { id: "e-2", rut: rutB, estado: "licencia" },
    ]);
    const { empleadosDesvinculados } = await precargarEmpleadosPorRut([rutA, rutB], {
      employee: { findMany },
    } as never);
    expect([...empleadosDesvinculados]).toEqual([rutA]);
  });

  it("no consulta la base si no hay RUT válidos", async () => {
    const findMany = jest.fn();
    const { employeeCache } = await precargarEmpleadosPorRut(["", "x"], { employee: { findMany } } as never);
    expect(findMany).not.toHaveBeenCalled();
    expect(employeeCache.size).toBe(0);
  });
});
