import { act, renderHook } from "@testing-library/react";
import { useBorrador } from "@/shared/hooks/useBorrador";

// Auditoria 27-sep-2026, 2.8: lo escrito en un formulario largo sobrevive a
// una sesion vencida, en la misma pestaña.
const CLAVE = "borrador:prueba";
type Datos = { nombre: string };

const montar = (datos: Datos, activo = true) =>
  renderHook((p: { datos: Datos; activo: boolean }) => useBorrador({ clave: CLAVE, ...p, esperaMs: 100 }), {
    initialProps: { datos, activo },
  });

beforeEach(() => {
  jest.useFakeTimers();
  window.sessionStorage.clear();
});
afterEach(() => jest.useRealTimers());

test("guarda los datos tras la pausa, solo mientras está activo", () => {
  const { rerender } = montar({ nombre: "" }, false);
  rerender({ datos: { nombre: "Ana" }, activo: false });
  act(() => jest.advanceTimersByTime(200));
  expect(window.sessionStorage.getItem(CLAVE)).toBeNull();

  rerender({ datos: { nombre: "Ana" }, activo: true });
  act(() => jest.advanceTimersByTime(200));
  expect(JSON.parse(window.sessionStorage.getItem(CLAVE)!).datos).toEqual({ nombre: "Ana" });
});

test("al volver ofrece el borrador y no lo pisa con el formulario vacío", () => {
  window.sessionStorage.setItem(
    CLAVE,
    JSON.stringify({ guardadoEn: "2026-09-28T13:32:00.000Z", datos: { nombre: "Ana" } })
  );
  const { result } = montar({ nombre: "" });
  act(() => jest.advanceTimersByTime(200));

  expect(result.current.borradorDe).toEqual(new Date("2026-09-28T13:32:00.000Z"));
  expect(JSON.parse(window.sessionStorage.getItem(CLAVE)!).datos).toEqual({ nombre: "Ana" });

  let recuperados: Datos | null = null;
  act(() => {
    recuperados = result.current.recuperar();
  });
  expect(recuperados).toEqual({ nombre: "Ana" });
  expect(result.current.borradorDe).toBeNull();
});

test("descartar borra el borrador", () => {
  window.sessionStorage.setItem(CLAVE, JSON.stringify({ guardadoEn: new Date().toISOString(), datos: { nombre: "Ana" } }));
  const { result } = montar({ nombre: "" });
  act(() => result.current.descartar());
  expect(result.current.borradorDe).toBeNull();
  expect(window.sessionStorage.getItem(CLAVE)).toBeNull();
});

test("limpiar (al enviar con éxito) borra lo guardado", () => {
  const { result } = montar({ nombre: "Ana" });
  act(() => jest.advanceTimersByTime(200));
  expect(window.sessionStorage.getItem(CLAVE)).not.toBeNull();
  act(() => result.current.limpiar());
  expect(window.sessionStorage.getItem(CLAVE)).toBeNull();
});

test("un borrador ilegible se ignora", () => {
  window.sessionStorage.setItem(CLAVE, "{roto");
  const { result } = montar({ nombre: "" });
  expect(result.current.borradorDe).toBeNull();
});

test("si el almacenamiento falla, el formulario sigue funcionando", () => {
  const espia = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("QuotaExceededError");
  });
  montar({ nombre: "Ana" });
  expect(() => act(() => jest.advanceTimersByTime(200))).not.toThrow();
  espia.mockRestore();
});
