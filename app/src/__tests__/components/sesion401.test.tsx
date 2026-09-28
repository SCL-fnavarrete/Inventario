import { act, render, screen } from "@testing-library/react";

// Auditoria 27-sep-2026, 2.8: un guardado sin sesion no recarga la pagina
// (se perderia lo escrito); avisa y deja el formulario como estaba.
const useSessionMock = jest.fn();
jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => useSessionMock(),
}));

// jsdom no trae Response: basta una minima con lo que usa el codigo.
class RespuestaMinima {
  status: number;
  constructor(private cuerpo: string, init: { status: number }) {
    this.status = init.status;
  }
  async json() {
    return JSON.parse(this.cuerpo);
  }
}
(globalThis as { Response?: unknown }).Response ??= RespuestaMinima;
(globalThis as { Request?: unknown }).Request ??= class {};

const fetchReal = jest.fn();
window.fetch = fetchReal;

// Se importa despues de fijar window.fetch: el modulo lo envuelve al cargar.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SessionProvider, MENSAJE_SESION_PERDIDA } = require("@/components/providers/SessionProvider");

const respuesta = (status: number, cuerpo: unknown = {}) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  fetchReal.mockReset();
  useSessionMock.mockReturnValue({ status: "authenticated" });
});

test("un guardado con 401 entrega un mensaje claro y muestra el aviso", async () => {
  fetchReal.mockResolvedValue(respuesta(401, { error: "No autorizado" }));
  render(<SessionProvider>formulario</SessionProvider>);

  let res!: Response;
  await act(async () => {
    res = await window.fetch("/api/solicitudes", { method: "POST", body: "{}" });
  });

  expect(res.status).toBe(401);
  expect((await res.json()).error).toBe(MENSAJE_SESION_PERDIDA);
  expect(screen.getByRole("alert")).toHaveTextContent("Tu sesión terminó");
  expect(screen.getByRole("link", { name: /Iniciar sesión en otra pestaña/ })).toHaveAttribute("target", "_blank");
  expect(screen.getByText("formulario")).toBeInTheDocument();
});

test("una respuesta normal pasa sin cambios", async () => {
  fetchReal.mockResolvedValue(respuesta(200, { ok: true }));
  const res = await window.fetch("/api/activos", { method: "PUT" });
  expect(await res.json()).toEqual({ ok: true });
});

test("el 401 de NextAuth no se toca", async () => {
  fetchReal.mockResolvedValue(respuesta(401, { error: "x" }));
  const res = await window.fetch("/api/auth/session", { method: "POST" });
  expect((await res.json()).error).toBe("x");
});

test("el aviso se va cuando la sesión vuelve", async () => {
  fetchReal.mockResolvedValue(respuesta(401));
  useSessionMock.mockReturnValue({ status: "unauthenticated" });
  const { rerender } = render(<SessionProvider>formulario</SessionProvider>);
  await act(async () => {
    await window.fetch("/api/solicitudes", { method: "PATCH" });
  });
  expect(screen.getByRole("alert")).toBeInTheDocument();

  useSessionMock.mockReturnValue({ status: "authenticated" });
  rerender(<SessionProvider>formulario</SessionProvider>);
  expect(screen.queryByRole("alert")).toBeNull();
});
