import { ordenarComo, paginarCoincidencias } from "@/shared/utilidades/busquedaEnMemoria";

// Auditoria 28-sep-2026 (3.1): se filtra con las columnas de busqueda y solo
// la pagina se trae completa.
const filas = [
  { id: "a", nombre: "José" },
  { id: "b", nombre: "Ana" },
  { id: "c", nombre: "José Luis" },
  { id: "d", nombre: "Josefa" },
];
const esJose = (f: { nombre: string }) => f.nombre.startsWith("Jos");

test("cuenta todas las coincidencias y devuelve solo los ids de la página", () => {
  expect(paginarCoincidencias(filas, esJose, 0, 2)).toEqual({ total: 3, ids: ["a", "c"] });
  expect(paginarCoincidencias(filas, esJose, 2, 2)).toEqual({ total: 3, ids: ["d"] });
  expect(paginarCoincidencias(filas, () => false, 0, 10)).toEqual({ total: 0, ids: [] });
});

test("ordenarComo respeta el orden de los ids aunque la base los devuelva en otro", () => {
  const desordenadas = [{ id: "d" }, { id: "a" }, { id: "c" }];
  expect(ordenarComo(["a", "c", "d"], desordenadas).map((f) => f.id)).toEqual(["a", "c", "d"]);
  expect(ordenarComo(["a", "x"], desordenadas).map((f) => f.id)).toEqual(["a"]);
});
