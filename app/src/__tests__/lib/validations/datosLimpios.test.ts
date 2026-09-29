import { createAssetSchema, updateAssetSchema } from "@/modules/activos/validaciones";
import { createEmployeeSchema, updateEmployeeSchema } from "@/modules/personas/validaciones";
import { equipoNuevoCompraSchema } from "@/modules/compras/validaciones";
import {
  createKitItemSchema,
  marcarKitItemNoAplicaSchema,
  updateKitItemSchema,
} from "@/modules/kit-epp/validaciones";
import { cancelWorkflowRequestSchema, createCommentSchema } from "@/modules/solicitudes/validaciones";
import {
  MENSAJE_GARANTIA_ANTES_DE_COMPRA,
  MENSAJE_TERMINO_ANTES_DE_INGRESO,
  terminaAntesDeEmpezar,
} from "@/shared/validaciones/ordenFechas";

// Auditoria 27-sep-2026, 2.5: textos obligatorios sin espacios de relleno,
// orden de fechas y fechaBaja fuera de la edicion de activos.

const CATEGORIA = "11111111-1111-4111-8111-111111111111";
const activo = (extra: Record<string, unknown> = {}) => ({
  categoriaId: CATEGORIA,
  marca: "Dell",
  modelo: "Latitude",
  ...extra,
});
const empleado = (extra: Record<string, unknown> = {}) => ({
  nombres: "Ana",
  apellidoPaterno: "Rojas",
  correoPersonal: "ana@correo.cl",
  ...extra,
});
const camposConError = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join(".")) ?? [];

describe("terminaAntesDeEmpezar", () => {
  it("solo es true si ambas fechas existen y el fin es anterior", () => {
    expect(terminaAntesDeEmpezar("2026-05-10", "2026-05-09")).toBe(true);
    expect(terminaAntesDeEmpezar("2026-05-10", "2026-05-10")).toBe(false);
    expect(terminaAntesDeEmpezar(new Date("2026-05-10"), "2026-06-01")).toBe(false);
    expect(terminaAntesDeEmpezar(null, "2026-05-09")).toBe(false);
    expect(terminaAntesDeEmpezar("2026-05-10", undefined)).toBe(false);
    expect(terminaAntesDeEmpezar("", "2026-05-09")).toBe(false);
    expect(terminaAntesDeEmpezar("no-es-fecha", "2026-05-09")).toBe(false);
  });
});

describe("activos", () => {
  it("rechaza marca o modelo hechos solo de espacios y recorta los demás", () => {
    expect(camposConError(createAssetSchema.safeParse(activo({ marca: "   " })))).toContain("marca");
    expect(camposConError(updateAssetSchema.safeParse({ modelo: "  " }))).toContain("modelo");
    const ok = createAssetSchema.parse(activo({ marca: "  Dell ", modelo: " XPS  " }));
    expect(ok.marca).toBe("Dell");
    expect(ok.modelo).toBe("XPS");
  });

  it("rechaza un fin de garantía anterior a la compra, en el campo correcto", () => {
    const r = createAssetSchema.safeParse(
      activo({ fechaCompra: "2026-03-01", fechaGarantiaFin: "2026-02-28" })
    );
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({
      path: ["fechaGarantiaFin"],
      message: MENSAJE_GARANTIA_ANTES_DE_COMPRA,
    });
    expect(
      createAssetSchema.safeParse(activo({ fechaCompra: "2026-03-01", fechaGarantiaFin: "2026-03-01" }))
        .success
    ).toBe(true);
  });

  it("los equipos nuevos de una compra siguen la misma regla de fechas", () => {
    const r = equipoNuevoCompraSchema.safeParse(
      activo({ fechaCompra: "2026-03-01", fechaGarantiaFin: "2025-03-01" })
    );
    expect(camposConError(r)).toContain("fechaGarantiaFin");
  });

  it("ya no acepta fechaBaja al crear ni al editar", () => {
    expect(createAssetSchema.parse(activo({ fechaBaja: "2026-01-01" }))).not.toHaveProperty("fechaBaja");
    expect(updateAssetSchema.parse({ fechaBaja: "2026-01-01" })).not.toHaveProperty("fechaBaja");
  });
});

describe("empleados", () => {
  it("recorta nombre, apellido y correo, y rechaza los que quedan vacíos", () => {
    const ok = createEmployeeSchema.parse(
      empleado({ nombres: " Ana ", apellidoPaterno: " Rojas", correoPersonal: " ana@correo.cl " })
    );
    expect(ok).toMatchObject({ nombres: "Ana", apellidoPaterno: "Rojas", correoPersonal: "ana@correo.cl" });
    expect(camposConError(createEmployeeSchema.safeParse(empleado({ nombres: "  " })))).toContain("nombres");
    expect(camposConError(updateEmployeeSchema.safeParse({ apellidoPaterno: " " }))).toContain(
      "apellidoPaterno"
    );
  });

  it("rechaza una fecha de término anterior al ingreso", () => {
    const r = createEmployeeSchema.safeParse(
      empleado({ fechaIngreso: "2026-05-10", fechaTermino: "2026-05-01" })
    );
    expect(r.error?.issues[0]).toMatchObject({
      path: ["fechaTermino"],
      message: MENSAJE_TERMINO_ANTES_DE_INGRESO,
    });
    expect(
      createEmployeeSchema.safeParse(empleado({ fechaIngreso: "2026-05-10", fechaTermino: "2026-05-10" }))
        .success
    ).toBe(true);
  });
});

describe("Kit y solicitudes", () => {
  it("rechazan textos obligatorios hechos solo de espacios", () => {
    expect(createKitItemSchema.safeParse({ nombre: "  ", categoria: "epp" }).success).toBe(false);
    expect(updateKitItemSchema.safeParse({ nombre: "  " }).success).toBe(false);
    expect(
      marcarKitItemNoAplicaSchema.safeParse({
        requestKitItemId: CATEGORIA,
        motivo: "   ",
      }).success
    ).toBe(false);
    expect(cancelWorkflowRequestSchema.safeParse({ motivo: "  " }).success).toBe(false);
    expect(createCommentSchema.safeParse({ mensaje: "\n  " }).success).toBe(false);
  });

  it("guardan el texto recortado", () => {
    expect(cancelWorkflowRequestSchema.parse({ motivo: " Duplicada " }).motivo).toBe("Duplicada");
    expect(createKitItemSchema.parse({ nombre: " Casco ", categoria: "epp" }).nombre).toBe("Casco");
  });
});
