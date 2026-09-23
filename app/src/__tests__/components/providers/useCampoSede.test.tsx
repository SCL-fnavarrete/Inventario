import { act, renderHook } from "@testing-library/react";
import {
  SedeSeleccionadaProvider,
  useCampoSede,
  useSedePorDefecto,
  useSedeSeleccionada,
} from "@/components/providers/SedeSeleccionadaProvider";

/**
 * SPEC 2.80: la sede del navbar es el valor por defecto de los formularios
 * de creacion. Prioridad navbar > sede de la sesion > vacio; una eleccion
 * manual no se pisa; un valor que llega tarde completa el campo sin tocar.
 */

type SesionMock = {
  data: { user: { role: string; sedeId?: string | null } } | null;
  status: "authenticated" | "loading";
};

let mockSesion: SesionMock;
jest.mock("next-auth/react", () => ({ useSession: () => mockSesion }));

const CLAVE_STORAGE = "inventario-sede-seleccionada";

function sesion(role: string, sedeId: string | null = null): SesionMock {
  return { data: { user: { role, sedeId } }, status: "authenticated" };
}

// El campo y el selector del navbar en el mismo arbol, como en la app.
function renderCampo() {
  return renderHook(
    () => ({ campo: useCampoSede(), nav: useSedeSeleccionada() }),
    { wrapper: SedeSeleccionadaProvider }
  );
}

beforeEach(() => {
  window.localStorage.clear();
  mockSesion = sesion("admin");
});

describe("useSedePorDefecto", () => {
  test("la sede del navbar gana sobre la de la sesion", () => {
    mockSesion = sesion("admin", "sede-propia");
    window.localStorage.setItem(CLAVE_STORAGE, "sede-navbar");
    const { result } = renderHook(() => useSedePorDefecto(), {
      wrapper: SedeSeleccionadaProvider,
    });
    expect(result.current.sedeId).toBe("sede-navbar");
  });

  test("con 'Todas las sedes' usa la sede de la sesion", () => {
    mockSesion = sesion("admin", "sede-propia");
    const { result } = renderHook(() => useSedePorDefecto(), {
      wrapper: SedeSeleccionadaProvider,
    });
    expect(result.current.sedeId).toBe("sede-propia");
  });

  test("sin navbar ni sede propia queda vacio", () => {
    const { result } = renderHook(() => useSedePorDefecto(), {
      wrapper: SedeSeleccionadaProvider,
    });
    expect(result.current.sedeId).toBe("");
  });

  test("no esta lista mientras carga la sesion", () => {
    mockSesion = { data: null, status: "loading" };
    const { result } = renderHook(() => useSedePorDefecto(), {
      wrapper: SedeSeleccionadaProvider,
    });
    expect(result.current.lista).toBe(false);
  });

  test("un tecnico siempre queda en su sede, aunque haya otra guardada", () => {
    mockSesion = sesion("tecnico", "sede-tecnico");
    window.localStorage.setItem(CLAVE_STORAGE, "sede-otra");
    const { result } = renderHook(() => useSedePorDefecto(), {
      wrapper: SedeSeleccionadaProvider,
    });
    expect(result.current.sedeId).toBe("sede-tecnico");
  });
});

describe("useCampoSede", () => {
  test("sin tocar, sigue al navbar (completa cuando el valor llega tarde)", () => {
    const { result } = renderCampo();
    expect(result.current.campo[0]).toBe("");

    act(() => result.current.nav.setSedeSeleccionada("sede-concepcion"));
    expect(result.current.campo[0]).toBe("sede-concepcion");
  });

  test("una eleccion manual no se pisa al cambiar el navbar", () => {
    const { result } = renderCampo();
    act(() => result.current.nav.setSedeSeleccionada("sede-concepcion"));
    act(() => result.current.campo[1]("sede-santiago"));

    act(() => result.current.nav.setSedeSeleccionada("sede-peru"));
    expect(result.current.campo[0]).toBe("sede-santiago");
  });

  test("elegir vacio a mano tambien cuenta como eleccion", () => {
    const { result } = renderCampo();
    act(() => result.current.campo[1](""));

    act(() => result.current.nav.setSedeSeleccionada("sede-concepcion"));
    expect(result.current.campo[0]).toBe("");
  });

  test("reiniciar vuelve a seguir la sede por defecto", () => {
    const { result } = renderCampo();
    act(() => result.current.campo[1]("sede-santiago"));
    act(() => result.current.nav.setSedeSeleccionada("sede-concepcion"));

    act(() => result.current.campo[2]());
    expect(result.current.campo[0]).toBe("sede-concepcion");
  });
});
