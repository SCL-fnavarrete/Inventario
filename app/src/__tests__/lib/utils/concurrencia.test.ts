/** @jest-environment node */
import { Prisma } from "@prisma/client";
import { siSigueIgual, MENSAJE_CAMBIO_SIMULTANEO } from "@/lib/utils/concurrencia";

// Auditoria 28-sep-2026 (7.A-1): una escritura condicionada que ya no
// encuentra la fila (otra operacion gano) responde 409.
const noEncontrado = () =>
  new Prisma.PrismaClientKnownRequestError("Record to update not found.", {
    code: "P2025",
    clientVersion: "5.22.0",
  });

test("devuelve el resultado si la fila seguía igual", async () => {
  await expect(siSigueIgual(Promise.resolve({ id: "a1" }))).resolves.toEqual({ id: "a1" });
});

test("si otra operación la cambió (P2025), responde 409 con un mensaje claro", async () => {
  await expect(siSigueIgual(Promise.reject(noEncontrado()))).rejects.toMatchObject({
    status: 409,
    message: MENSAJE_CAMBIO_SIMULTANEO,
  });
  await expect(siSigueIgual(Promise.reject(noEncontrado()), "Ya se vendió")).rejects.toMatchObject({
    message: "Ya se vendió",
  });
});

test("cualquier otro error pasa tal cual", async () => {
  const otro = new Error("se cayó la base");
  await expect(siSigueIgual(Promise.reject(otro))).rejects.toBe(otro);
});
