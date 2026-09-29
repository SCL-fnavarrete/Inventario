import { enteroEnRango, leerPaginacion } from "@/shared/utilidades/paginacion";

// Auditoria 27-sep-2026: ningun listado entrega mas filas que su tope.
const params = (q: string) => new URLSearchParams(q);

test("enteroEnRango acota y usa el valor por defecto ante basura", () => {
  expect(enteroEnRango("50", 10, 1, 100)).toBe(50);
  expect(enteroEnRango("1000000", 10, 1, 100)).toBe(100);
  expect(enteroEnRango("-3", 10, 1, 100)).toBe(1);
  expect(enteroEnRango("abc", 10, 1, 100)).toBe(10);
  expect(enteroEnRango(null, 10, 1, 100)).toBe(10);
});

test("leerPaginacion: por defecto página 1 y 10 filas, con tope de 100", () => {
  expect(leerPaginacion(params(""))).toEqual({ page: 1, limit: 10 });
  expect(leerPaginacion(params("page=3&limit=1000000"))).toEqual({ page: 3, limit: 100 });
  expect(leerPaginacion(params("page=0&limit=0"))).toEqual({ page: 1, limit: 1 });
});

test("cada ruta puede fijar su propio valor por defecto y su tope", () => {
  expect(leerPaginacion(params(""), { limitPorDefecto: 25 })).toEqual({ page: 1, limit: 25 });
  expect(leerPaginacion(params("limit=400"), { limitMaximo: 500 }).limit).toBe(400);
});
