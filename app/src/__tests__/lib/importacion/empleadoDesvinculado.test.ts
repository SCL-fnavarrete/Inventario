/** @jest-environment node */
import { procesarFila, type ContextoFila } from "@/lib/importacion/procesarFila";
import { interpretarRut } from "@/lib/importacion/activos";

// Auditoria 27-sep-2026, 2.9: un equipo no queda "asignado" a alguien que ya
// se desvinculo.
const RUT = (interpretarRut("11.111.111-1") as { rut: string }).rut;

const ctx = (desvinculados: string[]): ContextoFila => ({
  session: { user: { id: "u1", email: "a@x.cl", role: "admin", sedeId: null } } as never,
  categoriaId: "c1",
  exigeImei: false,
  tipoMantencionId: "",
  sedeIdExplicita: "s1",
  mapaSedes: { santiago: "s1" },
  mapaSistemasOperativos: {},
  mapaAntivirus: {},
  mapaLicenciasM365: {},
  existingSeriesSet: new Set(),
  existingImeiSet: new Set(),
  employeeCache: new Map([[RUT, "e-1"]]),
  empleadosDesvinculados: new Set(desvinculados),
});

const fila = (estado: string) => ({ marca: "Dell", modelo: "Latitude", numeroSerie: "ABC123", estado, rut: RUT });
const prismaFalso = { employee: { findUnique: jest.fn() } } as never;

test("rechaza la fila si el equipo quedaría asignado a un desvinculado", async () => {
  const r = await procesarFila(fila("Asignado"), ctx([RUT]), prismaFalso, true);
  expect(r).toMatchObject({ status: "error", tipo: "empleado_desvinculado", campo: "estado" });
  expect(r.status === "error" && r.mensaje).toContain("No devuelto");
});

test("con el estado No devuelto la fila pasa", async () => {
  const r = await procesarFila(fila("No devuelto"), ctx([RUT]), prismaFalso, true);
  expect(r.status).toBe("valid");
});

test("un empleado vigente no se ve afectado", async () => {
  const r = await procesarFila(fila("Asignado"), ctx([]), prismaFalso, true);
  expect(r.status).toBe("valid");
});

test("también lo detecta cuando el empleado se busca fila por fila", async () => {
  const findUnique = jest.fn().mockResolvedValue({ id: "e-9", estado: "desvinculado" });
  const c = { ...ctx([]), employeeCache: new Map<string, string>() };
  const r = await procesarFila(fila("Asignado"), c, { employee: { findUnique } } as never, true);
  expect(r).toMatchObject({ status: "error", tipo: "empleado_desvinculado" });
});
