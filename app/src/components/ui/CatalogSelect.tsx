"use client";

import { useEffect, useState } from "react";
import { Plus, Check, X } from "lucide-react";

type Opcion = { id: string; nombre: string; activo: boolean };

interface CatalogSelectProps {
  /** Endpoint del catalogo, ej. "/api/sistemas-operativos". */
  endpoint: string;
  /** Valor actual guardado en el activo (es texto plano, no el id del catalogo). */
  value: string;
  onChange: (nombre: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Select alimentado por un catalogo administrable en Configuracion (mismo
 * concepto que Categoria de Activos), con un boton para agregar una opcion
 * nueva sin salir del formulario. El campo del activo sigue siendo texto
 * plano: este componente solo controla que ese texto salga de una lista
 * cerrada en vez de tipeo libre.
 */
export function CatalogSelect({ endpoint, value, onChange, placeholder, className }: CatalogSelectProps) {
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [agregando, setAgregando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [guardando, setGuardando] = useState(false);

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
  const opcionesConValorActual =
    value && !opciones.some((o) => o.nombre === value)
      ? [...opciones, { id: `__actual__${value}`, nombre: value, activo: true }]
      : opciones;

  async function handleAgregar() {
    const nombre = nuevoNombre.trim();
    if (!nombre) return;
    setGuardando(true);
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
        onChange(creada.nombre);
      }
    } finally {
      setGuardando(false);
      setAgregando(false);
      setNuevoNombre("");
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
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAgregar();
              }
              if (e.key === "Escape") {
                setAgregando(false);
                setNuevoNombre("");
              }
            }}
            placeholder="Nombre de la opción nueva"
            className="field-input flex-1 text-sm"
          />
          <button
            type="button"
            onClick={handleAgregar}
            disabled={guardando || !nuevoNombre.trim()}
            className="px-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            title="Guardar opción"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setAgregando(false);
              setNuevoNombre("");
            }}
            className="px-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="Cancelar"
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex gap-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={loading}
          className="field-input flex-1 text-sm"
        >
          <option value="">{placeholder || "Selecciona..."}</option>
          {opcionesConValorActual.map((o) => (
            <option key={o.id} value={o.nombre}>
              {o.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            // Si el valor actual no calza con ninguna opcion del catalogo
            // (dato recien importado o corregido a mano), se parte con ese
            // mismo texto para que crear la opcion sea confirmar, no
            // retipear -- justo el caso de una fila de importacion que
            // quedo pendiente por un antivirus/SO/licencia no reconocido.
            setNuevoNombre((prev) => prev || value);
            setAgregando(true);
          }}
          className="px-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
          title="Agregar opción nueva"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
