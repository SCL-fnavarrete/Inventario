import {
  interpretarEstado,
  interpretarRut,
  parseCondicion,
  parseEstado,
  resolverCondicion,
  resolverEstado,
  tieneMicrosoft365,
} from "@/lib/importacion/activos";

describe("interpretarEstado", () => {
  it("reconoce un estado real del sistema", () => {
    expect(interpretarEstado("Asignado")).toEqual({ tipo: "estado", estado: "asignado" });
    expect(interpretarEstado("Disponible")).toEqual({ tipo: "estado", estado: "disponible" });
  });

  it("reconoce estados con acento, mayusculas y espacios sobrantes", () => {
    expect(interpretarEstado("  En Mantención ")).toEqual({
      tipo: "estado",
      estado: "en_mantencion",
    });
    expect(interpretarEstado("Mantencion")).toEqual({ tipo: "estado", estado: "en_mantencion" });
  });

  it("reconoce como condicion lo que los Excel de SCL ponen en la columna Estado", () => {
    expect(interpretarEstado("Usado")).toEqual({ tipo: "condicion", condicion: "usado" });
    expect(interpretarEstado("Nuevo")).toEqual({ tipo: "condicion", condicion: "nuevo" });
    expect(interpretarEstado("Seminuevo")).toEqual({ tipo: "condicion", condicion: "usado" });
  });

  it("no adivina: lo que no entiende lo marca como desconocido", () => {
    expect(interpretarEstado("SIM")).toEqual({ tipo: "desconocido", valor: "SIM" });
    expect(interpretarEstado("No disponible")).toEqual({
      tipo: "desconocido",
      valor: "No disponible",
    });
  });

  it("distingue celda vacia de valor no reconocido", () => {
    expect(interpretarEstado("")).toEqual({ tipo: "vacio" });
    expect(interpretarEstado("   ")).toEqual({ tipo: "vacio" });
    expect(interpretarEstado(null)).toEqual({ tipo: "vacio" });
    expect(interpretarEstado(undefined)).toEqual({ tipo: "vacio" });
  });
});

describe("resolverEstado", () => {
  it("respeta el estado cuando el Excel lo dice explicitamente", () => {
    expect(resolverEstado({ tipo: "estado", estado: "baja" }, true)).toBe("baja");
    expect(resolverEstado({ tipo: "estado", estado: "vendido" }, false)).toBe("vendido");
  });

  it("deduce el estado del RUT cuando la columna traia una condicion", () => {
    const lectura = interpretarEstado("Usado");
    expect(resolverEstado(lectura, true)).toBe("asignado");
    expect(resolverEstado(lectura, false)).toBe("disponible");
  });

  it("deduce el estado del RUT cuando la celda viene vacia", () => {
    expect(resolverEstado({ tipo: "vacio" }, true)).toBe("asignado");
    expect(resolverEstado({ tipo: "vacio" }, false)).toBe("disponible");
  });
});

describe("resolverCondicion", () => {
  it("usa la condicion escondida en la columna Estado", () => {
    expect(resolverCondicion(interpretarEstado("Nuevo"))).toBe("nuevo");
    expect(resolverCondicion(interpretarEstado("Seminuevo"))).toBe("usado");
  });

  it("una columna Condicion mapeada gana sobre la columna Estado", () => {
    expect(resolverCondicion(interpretarEstado("Nuevo"), "Dañado")).toBe("danado");
  });

  it("cae en usado solo cuando no hay ningun dato de condicion", () => {
    expect(resolverCondicion({ tipo: "estado", estado: "asignado" })).toBe("usado");
  });
});

describe("tieneMicrosoft365", () => {
  it("acepta el nombre del plan, que es lo que traen los Excel reales", () => {
    expect(tieneMicrosoft365("Premium")).toBe(true);
    expect(tieneMicrosoft365("E3")).toBe(true);
    expect(tieneMicrosoft365("Business Standard")).toBe(true);
  });

  it("sigue aceptando los si/no de siempre", () => {
    expect(tieneMicrosoft365("SI")).toBe(true);
    expect(tieneMicrosoft365("Sí")).toBe(true);
    expect(tieneMicrosoft365("1")).toBe(true);
    expect(tieneMicrosoft365("No")).toBe(false);
    expect(tieneMicrosoft365("0")).toBe(false);
    expect(tieneMicrosoft365("Sin licencia")).toBe(false);
  });

  it("celda vacia es false", () => {
    expect(tieneMicrosoft365("")).toBe(false);
    expect(tieneMicrosoft365(null)).toBe(false);
    expect(tieneMicrosoft365(undefined)).toBe(false);
  });
});

describe("interpretarRut", () => {
  it("devuelve el RUT en el mismo formato que usa el resto de la aplicacion", () => {
    expect(interpretarRut("197269715")).toEqual({ tipo: "valido", rut: "19.726.971-5" });
    expect(interpretarRut("19.726.971-5")).toEqual({ tipo: "valido", rut: "19.726.971-5" });
    expect(interpretarRut(" 19726971-5 ")).toEqual({ tipo: "valido", rut: "19.726.971-5" });
  });

  it("un RUT con digito verificador incorrecto no se guarda", () => {
    expect(interpretarRut("19.726.971-9")).toEqual({ tipo: "invalido", valor: "19.726.971-9" });
  });

  it("distingue celda vacia de RUT invalido", () => {
    expect(interpretarRut("")).toEqual({ tipo: "vacio" });
    expect(interpretarRut(null)).toEqual({ tipo: "vacio" });
    expect(interpretarRut("hola")).toEqual({ tipo: "invalido", valor: "hola" });
  });
});

describe("parseEstado / parseCondicion", () => {
  it("devuelven undefined en vez de un valor por defecto inventado", () => {
    expect(parseEstado("cualquier cosa")).toBeUndefined();
    expect(parseCondicion("cualquier cosa")).toBeUndefined();
  });
});
