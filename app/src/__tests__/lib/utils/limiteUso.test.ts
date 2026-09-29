/** @jest-environment node */
import { exigirCupo, LIMITES } from "@/shared/utilidades/limiteUso";

// Auditoria 28-sep-2026 (1.2): exportar, PDF e importar no se pueden repetir en bucle.
const { max, ventanaMs } = LIMITES.exportar;

test("deja pasar hasta el máximo y responde 429 al siguiente", () => {
  const t = 1_000_000;
  for (let i = 0; i < max; i++) exigirCupo("u-limite", "exportar", t + i);
  expect(() => exigirCupo("u-limite", "exportar", t + max)).toThrow(expect.objectContaining({ status: 429 }));
});

test("se libera cuando pasa la ventana", () => {
  const t = 5_000_000;
  for (let i = 0; i < max; i++) exigirCupo("u-ventana", "exportar", t);
  expect(() => exigirCupo("u-ventana", "exportar", t + ventanaMs + 1)).not.toThrow();
});

test("cada usuario y cada acción cuentan por separado", () => {
  const t = 9_000_000;
  for (let i = 0; i < max; i++) exigirCupo("u-a", "exportar", t);
  expect(() => exigirCupo("u-b", "exportar", t)).not.toThrow();
  expect(() => exigirCupo("u-a", "documento", t)).not.toThrow();
});
