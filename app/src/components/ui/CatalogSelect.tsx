"use client";

import { useEffect, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseApiError } from "@/lib/utils/apiErrors";
import { MensajeCampo } from "@/components/ui/CampoFormulario";

type Opcion = { id: string; nombre: string; activo: boolean };

interface CatalogSelectProps {
  /** Endpoint del catalogo, ej. "/api/sistemas-operativos". */
  endpoint: string;
  /** Valor actual guardado en el activo (es texto plano, no el id del catalogo). */
  value: string;
  onChange: (nombre: string) => void;
  placeholder?: string;
  className?: string;
  /** Guarda el id de la opcion en vez del nombre: para registros que apuntan
   * a ella, como el motivo de una baja (SPEC 2.116.5). */
  usarId?: boolean;
  /** Para unir el select a su etiqueta y marcarlo con error. */
  id?: string;
  invalido?: boolean;
}

/**
 * Select alimentado por un catalogo administrable en Configuracion (mismo
 * concepto que Categoria de Activos), con un boton para agregar una opcion
 * nueva sin salir del formulario. El campo del activo sigue siendo texto
 * plano: este componente solo controla que ese texto salga de una lista
 * cerrada en vez de tipeo libre.
 */
export function CatalogSelect({ endpoint, value, onChange, placeholder, className, usarId, id, invalido }: CatalogSelectProps) {
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [agregando, setAgregando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Si crear falla (sin permiso, nombre repetido, servidor caido) se dice y
  // la ventanita queda abierta, en vez de cerrarse sin avisar.
  const [errorAgregar, setErrorAgregar] = useState("");

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const res = await fetch(`${endpoint}?activas=true`);
        const data = await res.json();
        if (!cancelado) setOpciones(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelado) setOpciones([]);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [endpoint]);

  // El valor guardado puede no estar en el catalogo (dato historico
  // importado antes de que existiera la opcion); se agrega igual a la
  // lista para no perderlo de vista aunque no este activo formalmente.
  // Con usarId no aplica: un id que no esta en la lista no tiene nombre que mostrar.
  const opcionesConValorActual =
    value && !usarId && !opciones.some((o) => o.nombre === value)
      ? [...opciones, { id: `__actual__${value}`, nombre: value, activo: true }]
      : opciones;

  const cerrarAgregar = () => {
    setAgregando(false);
    setNuevoNombre("");
    setErrorAgregar("");
  };

  async function handleAgregar() {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setGuardando(true);
    setErrorAgregar("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });
      if (res.ok) {
        const creada: Opcion = await res.json();
        setOpciones((prev) =>
          prev.some((o) => o.id === creada.id) ? prev : [...prev, creada].sort((a, b) => a.nombre.localeCompare(b.nombre))
        );
        onChange(usarId ? creada.id : creada.nombre);
        cerrarAgregar();
      } else {
        // El motivo del campo ("Máximo 100 caracteres") dice mas que el general.
        const { message, fieldErrors } = await parseApiError(res, "No se pudo agregar la opción");
        setErrorAgregar(fieldErrors.nombre ?? message);
      }
    } catch {
      setErrorAgregar("No se pudo agregar la opción. Revisa la conexión e intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  if (agregando) {
    return (
      <div className={className}>
        <div className="flex gap-1">
          <input
            type="text"
            autoFocus
            value={nuevoNombre}
            onChange={(e) => {
              setNuevoNombre(e.target.value);
              setErrorAgregar("");
            }}
            aria-invalid={!!errorAgregar || undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAgregar();
              }
              if (e.key === "Escape") cerrarAgregar();
            }}
            maxLength={100}
            placeholder="Nombre de la opción nueva"
            className="field-input flex-1 text-sm"
          />
          <button aria-label="Guardar opción"
            type="button"
            onClick={handleAgregar}
            disabled={guardando || !nuevoNombre.trim()}
            className="px-2 rounded-lg bg-green-600 text-white hover:bg-success-hover disabled:opacity-50"
            title="Guardar opción"
          >
            <Check size={16} />
          </button>
          <button aria-label="Cancelar"
            type="button"
            onClick={cerrarAgregar}
            className="px-2 rounded-lg border border-line-strong text-fg-muted hover:bg-surface-muted"
            title="Cancelar"
          >
            <X size={16} />
          </button>
        </div>
        <MensajeCampo mensaje={errorAgregar} />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex gap-1">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading}
          aria-invalid={invalido || undefined}
          className={cn("field-input flex-1 text-sm", invalido && "border-red-500 bg-red-50")}
        >
          <option value="">{placeholder || "Selecciona..."}</option>
          {opcionesConValorActual.map((o) => (
            <option key={o.id} value={usarId ? o.id : o.nombre}>
              {o.nombre}
            </option>
          ))}
        </select>
        <button aria-label="Agregar opción nueva"
          type="button"
          onClick={() => {
            // Si el valor actual no calza con ninguna opcion del catalogo
            // (dato recien importado o corregido a mano), se parte con ese
            // mismo texto para que crear la opcion sea confirmar, no
            // retipear -- justo el caso de una fila de importacion que
            // quedo pendiente por un antivirus/SO/licencia no reconocido.
            setNuevoNombre((prev) => prev || (usarId ? "" : value));
            setAgregando(true);
          }}
          className="px-2 rounded-lg border border-line-strong text-fg-muted hover:bg-surface-muted"
          title="Agregar opción nueva"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
