/** @jest-environment node */
import { construirCsp } from "@/shared/seguridad/csp";

// Auditoria 28-sep-2026 (1.3): la politica solo permite lo del propio sitio.
test("en producción: nonce, sin eval y todo desde el propio sitio", () => {
  const csp = construirCsp("abc", false);
  expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
  expect(csp).not.toContain("unsafe-eval");
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("connect-src 'self';");
});

test("en desarrollo agrega lo que necesita la recarga en caliente", () => {
  const csp = construirCsp("abc", true);
  expect(csp).toContain("'unsafe-eval'");
  expect(csp).toContain("connect-src 'self' ws:");
});
