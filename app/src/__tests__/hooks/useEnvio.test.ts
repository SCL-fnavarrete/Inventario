import { act, renderHook } from "@testing-library/react";
import { useEnvio } from "@/shared/hooks/useEnvio";

// Auditoria 27-sep-2026 (6.2): un doble clic o Enter + clic no envian dos veces.
test("un segundo envío mientras el primero corre se ignora", async () => {
  let terminar!: () => void;
  const accion = jest.fn(() => new Promise<void>((r) => (terminar = r)));
  const { result } = renderHook(() => useEnvio());

  act(() => {
    result.current.ejecutar(accion);
    result.current.ejecutar(accion);
  });
  expect(accion).toHaveBeenCalledTimes(1);
  expect(result.current.enviando).toBe(true);

  await act(async () => terminar());
  expect(result.current.enviando).toBe(false);
});

test("después de terminar (aunque falle) se puede volver a enviar", async () => {
  const accion = jest.fn().mockRejectedValueOnce(new Error("sin red")).mockResolvedValueOnce(undefined);
  const { result } = renderHook(() => useEnvio());

  await act(async () => {
    await result.current.ejecutar(accion).catch(() => {});
  });
  expect(result.current.enviando).toBe(false);

  await act(async () => {
    await result.current.ejecutar(accion);
  });
  expect(accion).toHaveBeenCalledTimes(2);
});
