import { useEffect, useState } from "react";

/**
 * Devuelve `value`, pero retrasado: solo se actualiza despues de que pasen
 * `delayMs` sin que `value` vuelva a cambiar. Pensado para buscadores -- el
 * input responde a cada tecla, pero lo que dispara la peticion al servidor
 * es este valor debounced, para no hacer una peticion por letra.
 *
 * Compartido entre Asignaciones, Personal y Equipos para no reimplementar
 * el mismo timer en cada buscador.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 350): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
