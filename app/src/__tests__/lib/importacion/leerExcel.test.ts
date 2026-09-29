/** @jest-environment node */
import { leerFilasExcel, leerHoja, nombresDeHojas, valorDeCelda } from "@/modules/importacion/leerExcel";
import { crearExcel } from "@/test-utils/excel";

// Auditoria 28-sep-2026 (3.4): la lectura paso de `xlsx` a `exceljs` y tiene
// que entregar lo mismo que antes a procesarFila.

describe("valorDeCelda", () => {
  test("una fecha vuelve a su número de serie de Excel", () => {
    // 15-03-2026 es el serial 46096 en Excel.
    expect(valorDeCelda(new Date(Date.UTC(2026, 2, 15)))).toBe(46096);
  });

  test("fórmulas, texto con formato, hipervínculos y errores quedan como su valor visible", () => {
    expect(valorDeCelda({ formula: "A1+1", result: 5 })).toBe(5);
    expect(valorDeCelda({ richText: [{ text: "Del" }, { text: "l" }] })).toBe("Dell");
    expect(valorDeCelda({ text: "sitio", hyperlink: "https://x.cl" })).toBe("sitio");
    expect(valorDeCelda({ error: "#N/A" })).toBe("");
    expect(valorDeCelda(null)).toBe("");
    expect(valorDeCelda(true)).toBe(true);
  });
});

describe("leerFilasExcel", () => {
  test("mapea columnas por encabezado, recorta textos y convierte fechas a dd-mm-aaaa", async () => {
    const buffer = await crearExcel([
      ["Marca ", "N° Serie", "Fecha Compra", "RUT"],
      ["  Dell ", "ABC1", new Date(Date.UTC(2026, 2, 15)), "11.111.111-1"],
      ["Lenovo", "XYZ9", "15/03/2026", ""],
    ]);
    const { headers, filas } = await leerFilasExcel(buffer, "Hoja1", {
      marca: "Marca",
      numeroSerie: "N° Serie",
      fechaCompra: "Fecha Compra",
      rut: "RUT",
    });

    expect(headers).toEqual(["Marca ", "N° Serie", "Fecha Compra", "RUT"]);
    expect(filas).toEqual([
      { rowNum: 2, data: { marca: "Dell", numeroSerie: "ABC1", fechaCompra: "15-03-2026", rut: "11.111.111-1" } },
      { rowNum: 3, data: { marca: "Lenovo", numeroSerie: "XYZ9", fechaCompra: "15-03-2026", rut: "" } },
    ]);
  });

  test("salta las filas vacías y conserva el número de fila real", async () => {
    const buffer = await crearExcel([["Marca"], ["Dell"], [], ["HP"]]);
    const { filas } = await leerFilasExcel(buffer, "Hoja1", { marca: "Marca" });
    expect(filas.map((f) => [f.rowNum, f.data.marca])).toEqual([[2, "Dell"], [4, "HP"]]);
  });

  test("una columna mapeada que no existe queda vacía", async () => {
    const buffer = await crearExcel([["Marca"], ["Dell"]]);
    const { filas } = await leerFilasExcel(buffer, "Hoja1", { marca: "Marca", modelo: "Modelo" });
    expect(filas[0].data).toEqual({ marca: "Dell", modelo: "" });
  });
});

describe("hojas y errores", () => {
  test("lista los nombres de las hojas", async () => {
    expect(await nombresDeHojas(await crearExcel([["A"]], "Inventario"))).toEqual(["Inventario"]);
  });

  test("una hoja que no existe es un 400 claro, no un 500", async () => {
    const buffer = await crearExcel([["A"]]);
    await expect(leerHoja(buffer, "Otra")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("Otra") });
  });

  test("un archivo que no es un .xlsx legible es un 400", async () => {
    const basura = new TextEncoder().encode("PK\u0003\u0004 no soy un zip completo").buffer;
    await expect(nombresDeHojas(basura)).rejects.toMatchObject({ status: 400 });
  });
});
