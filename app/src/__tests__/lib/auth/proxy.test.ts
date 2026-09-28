/** @jest-environment node */
// proxy.ts decide quien pasa sin sesion (auditoria 28-sep-2026, 5.1): solo
// /login y la API (que responde 401 por su cuenta); todo lo demas exige sesion.
import { NextRequest } from "next/server";

type Authorized = (a: { token: unknown; req: NextRequest }) => boolean;
type Proxy = (req: NextRequest & { nextauth: { token: unknown } }) => Response;

// withAuth se reemplaza por una funcion que guarda lo que recibe.
const capturado: { proxy?: Proxy; opciones?: { callbacks: { authorized: Authorized }; pages: { signIn: string } } } = {};
jest.mock("next-auth/middleware", () => ({
  withAuth: (proxy: Proxy, opciones: typeof capturado.opciones) => {
    capturado.proxy = proxy;
    capturado.opciones = opciones;
    // Llama a la funcion vigente: un test puede simular lo que hace NextAuth en /login.
    return (req: never) => capturado.proxy!(req);
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { default: proxy, config } = require("@/proxy");

const pedir = (ruta: string) => new NextRequest(`http://localhost${ruta}`);
const autorizado = (ruta: string, token: unknown) =>
  capturado.opciones!.callbacks.authorized({ token, req: pedir(ruta) });

describe("quién pasa (authorized)", () => {
  test("sin sesión solo pasan /login y la API", () => {
    expect(autorizado("/login", null)).toBe(true);
    expect(autorizado("/api/activos", null)).toBe(true);
    expect(autorizado("/", null)).toBe(false);
    expect(autorizado("/activos", null)).toBe(false);
    expect(autorizado("/configuracion/usuarios", null)).toBe(false);
  });

  test("con sesión pasa todo", () => {
    expect(autorizado("/activos", { id: "u1" })).toBe(true);
  });

  test("al que no pasa lo manda al /login propio, no al de NextAuth", () => {
    expect(capturado.opciones!.pages.signIn).toBe("/login");
  });
});

describe("la función del proxy", () => {
  // La funcion exportada: sesion (withAuth simulado) y despues la CSP.
  const correr = (ruta: string, token: unknown): Promise<Response> =>
    proxy(Object.assign(pedir(ruta), { nextauth: { token } }), {});

  test("withAuth deja pasar /login sin llamar a su función: igual lleva CSP", async () => {
    const soloSesion = capturado.proxy!;
    capturado.proxy = (() => undefined) as unknown as Proxy; // lo que hace NextAuth en /login
    try {
      const res = await correr("/login", null);
      expect(res.headers.get("content-security-policy")).toMatch(/'nonce-/);
    } finally {
      capturado.proxy = soloSesion;
    }
  });

  test("una página sin sesión redirige a /login", async () => {
    const res = await correr("/activos", null);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  test("la API sin sesión no se redirige: sigue y la ruta responde 401", async () => {
    expect((await correr("/api/activos", null)).headers.get("location")).toBeNull();
  });

  test("con sesión sigue de largo", async () => {
    expect((await correr("/activos", { id: "u1" })).headers.get("location")).toBeNull();
  });

  // Auditoria 28-sep-2026 (1.3): CSP con un nonce nuevo en cada visita.
  test("cada página lleva su CSP con un nonce distinto, sin 'unsafe-inline' en scripts", async () => {
    const csp1 = (await correr("/activos", { id: "u1" })).headers.get("content-security-policy")!;
    const csp2 = (await correr("/login", null)).headers.get("content-security-policy")!;
    const nonce = (csp: string) => csp.match(/'nonce-([^']+)'/)?.[1];

    expect(nonce(csp1)).toBeTruthy();
    expect(nonce(csp1)).not.toBe(nonce(csp2));
    expect(csp1).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp1.match(/script-src[^;]*/)![0]).not.toContain("unsafe-inline");
  });

  test("la API no lleva CSP (en un PDF bloquearía el visor)", async () => {
    expect((await correr("/api/activos", { id: "u1" })).headers.get("content-security-policy")).toBeNull();
  });
});

describe("qué rutas revisa (matcher)", () => {
  const revisa = (ruta: string) => new RegExp(`^${config.matcher[0]}$`).test(ruta);

  test("revisa páginas y la API", () => {
    expect(revisa("/")).toBe(true);
    expect(revisa("/activos/123")).toBe(true);
    expect(revisa("/api/activos")).toBe(true);
  });

  test("no revisa NextAuth ni archivos estáticos", () => {
    expect(revisa("/api/auth/session")).toBe(false);
    expect(revisa("/_next/static/chunk.js")).toBe(false);
    expect(revisa("/logo-scl.png")).toBe(false);
    expect(revisa("/favicon.ico")).toBe(false);
  });
});
