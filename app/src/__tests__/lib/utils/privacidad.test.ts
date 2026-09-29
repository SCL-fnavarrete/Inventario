import { sinIdsDeUsuario } from "@/shared/utilidades/privacidad";

// Auditoria 27-sep-2026 (F1-01): las respuestas de la API no llevan el id
// interno de los usuarios del sistema.
test("quita los ids de usuario en cualquier nivel", () => {
  const r = sinIdsDeUsuario({
    id: "sol-1",
    solicitanteId: "u1",
    responsableActualId: "u2",
    transiciones: [{ ejecutadoPorId: "u3", estado: "recibida" }],
    comentarios: [{ autorId: "u4", autor: { nombre: "Ana" } }],
    accesos: [{ usuarioId: "u5", resultado: "exito" }],
  });
  expect(r).toEqual({
    id: "sol-1",
    transiciones: [{ estado: "recibida" }],
    comentarios: [{ autor: { nombre: "Ana" } }],
    accesos: [{ resultado: "exito" }],
  });
});

test("no toca fechas ni otros objetos que no son planos", () => {
  const fecha = new Date("2026-09-28");
  const r = sinIdsDeUsuario({ creado: fecha, lista: [fecha] });
  expect(r.creado).toBe(fecha);
  expect(r.lista[0]).toBe(fecha);
});

test("deja pasar valores simples, nulos y listas vacías", () => {
  expect(sinIdsDeUsuario(null)).toBeNull();
  expect(sinIdsDeUsuario("texto")).toBe("texto");
  expect(sinIdsDeUsuario([])).toEqual([]);
  expect(sinIdsDeUsuario(Object.assign(Object.create(null), { autorId: "u", a: 1 }))).toEqual({ a: 1 });
});
