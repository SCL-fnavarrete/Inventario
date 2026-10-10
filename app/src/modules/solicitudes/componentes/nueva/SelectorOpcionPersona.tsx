"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { nombresDeLista } from "@/modules/personas";
import type { TipoOpcionPersona } from "@/modules/personas";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { CampoFormulario, MensajeCampo } from "@/shared/ui/CampoFormulario";
import { SelectorBuscable } from "@/shared/ui/SelectorBuscable";

type Opcion = { id: string; nombre: string };
const textoDe = (o: Opcion) => [o.nombre];

/** Las opciones activas de la lista; el id de cada una es su nombre (la persona guarda el texto). */
function useOpciones(tipo: TipoOpcionPersona) {
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const agregar = (nombre: string) =>
    setOpciones((prev) => (prev.some((o) => o.id === nombre) ? prev : [...prev, { id: nombre, nombre }].sort((a, b) => a.nombre.localeCompare(b.nombre))));
  useEffect(() => {
    let cancelado = false;
    fetch(`/api/opciones-persona/${tipo}?activas=true`)
      .then((res) => (res.ok ? res.json() : []))
      .then((datos: { nombre: string }[]) => {
        if (!cancelado) setOpciones(datos.map((o) => ({ id: o.nombre, nombre: o.nombre })));
      })
      .catch(() => {
        if (!cancelado) setOpciones([]);
      });
    return () => {
      cancelado = true;
    };
  }, [tipo]);
  return { opciones, agregar };
}

/**
 * Campo de un onboarding que se elige de una lista (SPEC 2.142), con buscador.
 * Con `multiple` se pueden elegir varias (listas de distribucion) y el valor
 * queda separado por coma. Las opciones se administran en Solicitudes > Catalogos.
 */
export function SelectorOpcionPersona({
  tipo,
  label,
  value,
  onChange,
  error,
  obligatorio,
  multiple = false,
}: {
  tipo: TipoOpcionPersona;
  label: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  obligatorio?: boolean;
  multiple?: boolean;
}) {
  const { opciones, agregar } = useOpciones(tipo);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [errorNuevo, setErrorNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const elegidas = useMemo(() => (multiple ? nombresDeLista(value) : []), [multiple, value]);
  // Lo que ya esta elegido siempre se ve, aunque la opcion se haya desactivado despues.
  const lista = useMemo(() => {
    const extra = (multiple ? elegidas : value ? [value] : []).filter((n) => !opciones.some((o) => o.id === n));
    return [...opciones, ...extra.map((n) => ({ id: n, nombre: n }))];
  }, [opciones, elegidas, multiple, value]);

  const cerrarNuevo = () => {
    setCreando(false);
    setNuevo("");
    setErrorNuevo("");
  };
  // Crea la opcion al momento y la deja elegida.
  const crear = async () => {
    const nombre = nuevo.trim();
    if (!nombre || guardando) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/opciones-persona/${tipo}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      if (!res.ok) {
        const { message, fieldErrors } = await parseApiError(res, "No se pudo agregar la opción");
        setErrorNuevo(fieldErrors.nombre ?? message);
        return;
      }
      const creada: { nombre: string } = await res.json();
      agregar(creada.nombre);
      if (!multiple) onChange(creada.nombre);
      else if (!elegidas.includes(creada.nombre)) onChange([...elegidas, creada.nombre].join(", "));
      cerrarNuevo();
    } catch {
      setErrorNuevo("No se pudo agregar la opción. Revisa la conexión e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <CampoFormulario label={label} obligatorio={obligatorio} error={error}>
      {creando ? (
        <div>
          <div className="flex gap-1">
            <input
              type="text"
              autoFocus
              value={nuevo}
              maxLength={100}
              onChange={(e) => {
                setNuevo(e.target.value);
                setErrorNuevo("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void crear();
                }
                if (e.key === "Escape") cerrarNuevo();
              }}
              aria-label={`Nombre de la opción nueva de ${label}`}
              aria-invalid={!!errorNuevo || undefined}
              placeholder="Nombre de la opción nueva"
              className="field-input field-input-sm flex-1"
            />
            <button type="button" onClick={() => void crear()} disabled={guardando || !nuevo.trim()} aria-label="Guardar opción" title="Guardar opción" className="rounded-control bg-green-600 px-2 text-white hover:bg-success-hover disabled:opacity-50">
              <Check size={16} />
            </button>
            <button type="button" onClick={cerrarNuevo} aria-label="Cancelar" title="Cancelar" className="rounded-control border border-line-strong px-2 text-fg-muted hover:bg-surface-muted">
              <X size={16} />
            </button>
          </div>
          <MensajeCampo mensaje={errorNuevo} />
        </div>
      ) : (
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <SelectorBuscable
              opciones={multiple ? lista.filter((o) => !elegidas.includes(o.id)) : lista}
              value={multiple ? "" : value}
              onChange={(id) => (multiple ? id && onChange([...elegidas, id].join(", ")) : onChange(id))}
              textoDe={textoDe}
              renderOpcion={(o) => o.nombre}
              etiquetaElegida={(o) => o.nombre}
              placeholder={multiple ? "Agregar una lista..." : "Seleccionar..."}
              buscar="Buscar..."
              vacio={multiple && elegidas.length ? "Ya elegiste todas" : "No hay opciones: agrégalas en Catálogos"}
              limpiable={!multiple}
              invalido={!!error}
            />
          </div>
          <button type="button" onClick={() => setCreando(true)} aria-label={`Agregar opción nueva de ${label}`} title="Agregar opción nueva" className="rounded-control border border-line-strong px-2 py-1.5 text-fg-muted hover:bg-surface-muted">
            <Plus size={16} />
          </button>
        </div>
      )}
      {multiple && elegidas.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {elegidas.map((n) => (
            <li key={n} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-muted px-2 py-0.5 text-xs text-fg">
              {n}
              <button
                type="button"
                onClick={() => onChange(elegidas.filter((e) => e !== n).join(", "))}
                aria-label={`Quitar ${n}`}
                className="text-fg-subtle hover:text-fg"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </CampoFormulario>
  );
}
