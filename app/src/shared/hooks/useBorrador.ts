"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Borrador de un formulario largo en sessionStorage (auditoria 27-sep-2026,
 * 2.8). Si la sesion vence mientras alguien llena el formulario, la pantalla
 * se va al inicio de sesion y antes se perdia todo lo escrito; ahora, al
 * volver a la misma pestaña, se ofrece recuperarlo.
 *
 * - Se guarda solo en esta pestaña del navegador y se borra al cerrarla: no
 *   llega al servidor ni a otras personas.
 * - `datos` se guarda (con una pausa de `esperaMs`) mientras `activo` sea
 *   true. Mientras haya un borrador anterior sin decidir, no se guarda nada,
 *   para que el formulario vacio no lo pise antes de que la persona elija.
 * - `limpiar()` se llama al enviar con exito.
 * - Cualquier falla del almacenamiento (modo privado, cuota) se ignora: el
 *   borrador es una ayuda, nunca un requisito.
 */

type Guardado<T> = { guardadoEn: string; datos: T };

function leer<T>(clave: string): Guardado<T> | null {
  try {
    const texto = window.sessionStorage.getItem(clave);
    if (!texto) return null;
    const guardado = JSON.parse(texto) as Guardado<T>;
    return guardado && typeof guardado.guardadoEn === "string" && "datos" in guardado ? guardado : null;
  } catch {
    return null;
  }
}

function borrar(clave: string) {
  try {
    window.sessionStorage.removeItem(clave);
  } catch {
    // sin almacenamiento disponible: nada que borrar
  }
}

export function useBorrador<T>({
  clave,
  datos,
  activo,
  esperaMs = 500,
}: {
  clave: string;
  datos: T;
  activo: boolean;
  esperaMs?: number;
}) {
  // Borrador encontrado al abrir la pantalla, a la espera de que la persona
  // lo recupere o lo descarte.
  const [pendiente, setPendiente] = useState<Guardado<T> | null>(null);
  const revisado = useRef(false);

  useEffect(() => {
    if (revisado.current) return;
    revisado.current = true;
    const guardado = leer<T>(clave);
    // Lectura unica al montar: sessionStorage no existe durante el render
    // del servidor, asi que no puede ser el valor inicial del estado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (guardado) setPendiente(guardado);
  }, [clave]);

  useEffect(() => {
    if (!activo || pendiente || !revisado.current) return;
    const id = setTimeout(() => {
      try {
        const guardado: Guardado<T> = { guardadoEn: new Date().toISOString(), datos };
        window.sessionStorage.setItem(clave, JSON.stringify(guardado));
      } catch {
        // cuota llena o almacenamiento bloqueado: se sigue sin borrador
      }
    }, esperaMs);
    return () => clearTimeout(id);
  }, [clave, datos, activo, pendiente, esperaMs]);

  /** Entrega los datos guardados y deja de ofrecer el borrador. */
  const recuperar = useCallback((): T | null => {
    const datosGuardados = pendiente?.datos ?? null;
    setPendiente(null);
    return datosGuardados;
  }, [pendiente]);

  const descartar = useCallback(() => {
    borrar(clave);
    setPendiente(null);
  }, [clave]);

  const limpiar = useCallback(() => borrar(clave), [clave]);

  return {
    /** Hora del borrador pendiente, o null si no hay nada que ofrecer. */
    borradorDe: pendiente ? new Date(pendiente.guardadoEn) : null,
    recuperar,
    descartar,
    limpiar,
  };
}
