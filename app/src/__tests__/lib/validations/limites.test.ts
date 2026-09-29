import { createKitItemSchema, entregarKitItemsSchema } from "@/modules/kit-epp/validaciones";
import { createAssetSchema } from "@/modules/activos/validaciones";
import { updateEmployeeSchema } from "@/modules/personas/validaciones";
import { completeMaintenanceSchema } from "@/modules/mantenciones/validaciones";
import { MAX_CANTIDAD } from "@/shared/validaciones/comunes";

// Auditoria 28-sep-2026 (7.B): ningun numero ni texto sin tope llega a la base.
const CATEGORIA = "11111111-1111-4111-8111-111111111111";
const activo = (extra: Record<string, unknown>) => ({ categoriaId: CATEGORIA, marca: "Dell", modelo: "X", ...extra });

test("cantidades: hasta 1.000.000, nunca un entero que desborde la base", () => {
  expect(createKitItemSchema.safeParse({ nombre: "Casco", categoria: "epp", cantidad: MAX_CANTIDAD }).success).toBe(true);
  expect(createKitItemSchema.safeParse({ nombre: "Casco", categoria: "epp", cantidad: 3_000_000_000 }).success).toBe(false);
  const item = "22222222-2222-4222-8222-222222222222";
  expect(entregarKitItemsSchema.safeParse({ items: [{ itemId: item, cantidad: "5" }] }).success).toBe(true);
  expect(entregarKitItemsSchema.safeParse({ items: [{ itemId: item, cantidad: 2_000_000 }] }).success).toBe(false);
});

test("activo: observaciones con largo máximo y fechas reales", () => {
  expect(createAssetSchema.safeParse(activo({ observaciones: "x".repeat(2000) })).success).toBe(true);
  expect(createAssetSchema.safeParse(activo({ observaciones: "x".repeat(2001) })).success).toBe(false);
  expect(createAssetSchema.safeParse(activo({ fechaCompra: "2026-03-01" })).success).toBe(true);
  expect(createAssetSchema.safeParse(activo({ fechaCompra: "" })).success).toBe(true);
  const mala = createAssetSchema.safeParse(activo({ fechaCompra: "abc" }));
  expect(mala.error?.issues[0]).toMatchObject({ path: ["fechaCompra"], message: "Fecha inválida" });
  expect(createAssetSchema.safeParse(activo({ pulgadas: 1000 })).success).toBe(false);
});

test("empleado: teléfono con formato de teléfono", () => {
  expect(updateEmployeeSchema.safeParse({ telefonoContacto: "+56 9 1234-5678" }).success).toBe(true);
  expect(updateEmployeeSchema.safeParse({ telefonoContacto: "" }).success).toBe(true);
  expect(updateEmployeeSchema.safeParse({ telefonoContacto: "llamar a Ana" }).success).toBe(false);
});

test("mantención: el costo no pasa el tope de su columna", () => {
  const base = { fechaRealizada: "2026-09-28", realizadoPor: "Técnico", resultado: "Ok", resultadoTipo: "reparado" };
  expect(completeMaintenanceSchema.safeParse({ ...base, costo: 50_000 }).success).toBe(true);
  expect(completeMaintenanceSchema.safeParse({ ...base, costo: 100_000_000 }).success).toBe(false);
});
