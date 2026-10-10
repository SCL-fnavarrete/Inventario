"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/shared/cn";
import { coincidePorPalabras } from "@/shared/utilidades/text";

/**
 * Lista para elegir una opcion con un buscador adentro: se escribe parte de la
 * marca, el modelo, la serie... y la lista se acorta (no distingue tildes ni
 * mayusculas; cada palabra escrita tiene que aparecer). Se maneja con el
 * teclado: flechas, Enter para elegir y Esc para cerrar. Reemplaza al `<select>`
 * cuando hay muchas opciones y buscar una por una cansa.
 */
export function SelectorBuscable<T extends { id: string }>({
  opciones,
  value,
  onChange,
  textoDe,
  renderOpcion,
  etiquetaElegida,
  placeholder = "Seleccionar...",
  buscar = "Buscar...",
  vacio = "No hay opciones",
  limpiable = true,
  invalido = false,
  id,
}: {
  opciones: T[];
  value: string;
  onChange: (id: string) => void;
  /** Todo el texto donde se busca de una opcion (marca, modelo, serie, IMEI...). */
  textoDe: (opcion: T) => (string | null | undefined)[];
  /** Como se ve cada opcion en la lista. */
  renderOpcion: (opcion: T) => ReactNode;
  /** Como se ve la opcion elegida en el boton. */
  etiquetaElegida: (opcion: T) => string;
  placeholder?: string;
  buscar?: string;
  vacio?: string;
  /** Muestra una X para quitar la eleccion. */
  limpiable?: boolean;
  invalido?: boolean;
  id?: string;
}) {
  const idAuto = useId();
  const idLista = `${idAuto}-lista`;
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [activa, setActiva] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const elegida = opciones.find((o) => o.id === value);
  const visibles = useMemo(
    () => (texto.trim() ? opciones.filter((o) => coincidePorPalabras(texto, textoDe(o))) : opciones),
    [opciones, texto, textoDe]
  );

  const cerrar = () => {
    setAbierto(false);
    setTexto("");
  };
  const elegir = (opcion: T) => {
    onChange(opcion.id);
    cerrar();
  };

  // Al abrir, el cursor va directo al buscador.
  useEffect(() => {
    if (abierto) entrada.current?.focus();
  }, [abierto]);

  // Un clic fuera cierra la lista.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  // La opcion activa siempre se ve al moverse con el teclado.
  useEffect(() => {
    if (abierto) document.getElementById(`${idAuto}-op-${activa}`)?.scrollIntoView?.({ block: "nearest" });
  }, [activa, abierto, idAuto]);

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiva((i) => Math.min(i + 1, visibles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visibles[activa]) elegir(visibles[activa]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
    }
  };

  return (
    <div ref={raiz} className="relative">
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          id={id}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-controls={abierto ? idLista : undefined}
          onClick={() => (abierto ? cerrar() : (setActiva(0), setAbierto(true)))}
          className={cn(
            "field-input field-input-sm flex min-w-0 flex-1 items-center justify-between gap-2 text-left",
            invalido && "border-red-500"
          )}
        >
          <span className={cn("truncate", !elegida && "text-fg-subtle")}>{elegida ? etiquetaElegida(elegida) : placeholder}</span>
          <ChevronDown size={16} className="shrink-0 text-fg-subtle" aria-hidden />
        </button>
        {limpiable && elegida && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Quitar la elección"
            className="rounded-control border border-line px-2 text-fg-subtle hover:bg-surface-muted"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {abierto && (
        <div className="absolute z-30 mt-1 w-full min-w-64 rounded-control border border-line bg-surface shadow-lg">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={14} className="shrink-0 text-fg-subtle" aria-hidden />
            <input
              ref={entrada}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setActiva(0);
              }}
              onKeyDown={alTeclear}
              placeholder={buscar}
              aria-label={buscar}
              role="combobox"
              aria-expanded
              aria-controls={idLista}
              aria-activedescendant={visibles[activa] ? `${idAuto}-op-${activa}` : undefined}
              className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
            <span className="shrink-0 text-xs text-fg-subtle" aria-live="polite">
              {visibles.length}/{opciones.length}
            </span>
          </div>
          <ul id={idLista} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {visibles.length === 0 ? (
              <li className="px-3 py-3 text-sm text-fg-subtle">{opciones.length === 0 ? vacio : `Nada coincide con «${texto}»`}</li>
            ) : (
              visibles.map((o, i) => (
                <li
                  key={o.id}
                  id={`${idAuto}-op-${i}`}
                  role="option"
                  aria-selected={o.id === value}
                  onMouseEnter={() => setActiva(i)}
                  onClick={() => elegir(o)}
                  className={cn("flex cursor-pointer items-start gap-2 px-3 py-2 text-sm", i === activa && "bg-surface-muted")}
                >
                  <Check size={14} className={cn("mt-0.5 shrink-0 text-brand", o.id !== value && "invisible")} aria-hidden />
                  <span className="min-w-0 flex-1">{renderOpcion(o)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
