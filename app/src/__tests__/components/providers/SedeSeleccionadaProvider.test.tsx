import { act, renderHook } from "@testing-library/react";
import {
  SedeSeleccionadaProvider,
  useSedeSeleccionada,
} from "@/components/providers/SedeSeleccionadaProvider";

/**
 * SPEC 2.29 (14-sep-2026): selector de sede global del nav. Se prueba el
 * contrato del contexto -- arranca en "todas las sedes" (null), persiste en
 * localStorage al cambiar, y lee lo persistido al montar -- que es
 * justamente lo que hace que el filtro sobreviva la navegación entre
 * módulos y un refresh de página.
 */

const CLAVE_STORAGE = "inventario-sede-seleccionada";

beforeEach(() => {
  window.localStorage.clear();
});

describe("useSedeSeleccionada", () => {
  test("arranca en null (todas las sedes) sin nada guardado", () => {
    const { result } = renderHook(() => useSedeSeleccionada(), {
      wrapper: SedeSeleccionadaProvider,
    });
    expect(result.current.sedeSeleccionada).toBeNull();
  });

  test("lanza si se usa fuera del provider", () => {
    // Se silencia console.error: React loguea el throw dentro de renderHook.
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSedeSeleccionada())).toThrow(
      "useSedeSeleccionada debe usarse dentro de <SedeSeleccionadaProvider>"
    );
    spy.mockRestore();
  });

  test("elegir una sede actualiza el contexto y lo guarda en localStorage", () => {
    const { result } = renderHook(() => useSedeSeleccionada(), {
      wrapper: SedeSeleccionadaProvider,
    });

    act(() => {
      result.current.setSedeSeleccionada("sede-santiago");
    });

    expect(result.current.sedeSeleccionada).toBe("sede-santiago");
    expect(window.localStorage.getItem(CLAVE_STORAGE)).toBe("sede-santiago");
  });

  test('elegir "todas las sedes" (null) limpia el localStorage', () => {
    window.localStorage.setItem(CLAVE_STORAGE, "sede-santiago");
    const { result } = renderHook(() => useSedeSeleccionada(), {
      wrapper: SedeSeleccionadaProvider,
    });

    act(() => {
      result.current.setSedeSeleccionada(null);
    });

    expect(result.current.sedeSeleccionada).toBeNull();
    expect(window.localStorage.getItem(CLAVE_STORAGE)).toBeNull();
  });

  test("al montar, hidrata la sede que ya estaba guardada en localStorage", async () => {
    window.localStorage.setItem(CLAVE_STORAGE, "sede-concepcion");

    const { result, rerender } = renderHook(() => useSedeSeleccionada(), {
      wrapper: SedeSeleccionadaProvider,
    });

    // El valor inicial del primer render es null (para no desajustar la
    // hidratación de Next.js); el useEffect lo actualiza justo después.
    await act(async () => {
      rerender();
    });

    expect(result.current.sedeSeleccionada).toBe("sede-concepcion");
  });
});
