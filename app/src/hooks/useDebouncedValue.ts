import { useEffect, useState } from "react";

/**
 * Devuelve `value`, pero retrasado: solo se actualiza despues de que pasen
 * `delayMs` sin que `value` vuelva a cambiar. Pensado para buscadores -- el
 * input se actualiza en cada tecla (responde al toque), pero lo que dispara
 * la peticion al servidor es este valor debounced, asi que no se hace una
 * peticion por cada letra.
 *
 * Compartido entre Asignaciones, Personal y Equipos (11-sep-2026): las tres
 * tenian un buscador con reglas distintas -- Asignaciones buscaba en cada
 * tecla sin ningun freno (una peticion por letra, sin necesidad); Personal y
 * Equipos exigian Enter para aplicar la busqueda (el usuario podia escribir
 * y nada pasaba hasta que enviara el formulario). Pedido explicito de
 * Javier: que las tres se sientan como Asignaciones se sentia, pero sin el
 * desperdicio de peticiones que ya tenia -- de ahi este hook, en vez de
 * reimplementar el mismo timer tres veces.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 350): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
