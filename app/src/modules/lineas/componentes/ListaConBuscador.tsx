"use client";

import { useId, useState } from "react";
import { CampoFormulario, claseInput } from "@/shared/ui/CampoFormulario";
import { coincidePorPalabras } from "@/shared/utilidades/text";

/** Lista desplegable con un buscador encima que acorta las opciones (no distingue tildes). */
export function ListaConBuscador({
  label,
  valor,
  onChange,
  opciones,
  vacio,
  buscar,
  error,
  ayuda,
  disabled = false,
  className = "lg:col-span-2",
}: {
  label: string;
  valor: string;
  onChange: (id: string) => void;
  opciones: { id: string; texto: string }[];
  vacio: string;
  buscar: string;
  error?: string;
  ayuda?: string;
  /** Bloqueada: no se puede elegir nada (ej. una eSIM no lleva celular). */
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const [filtro, setFiltro] = useState("");
  // La opcion elegida se mantiene aunque no calce con lo escrito.
  const visibles = filtro.trim() ? opciones.filter((o) => o.id === valor || coincidePorPalabras(filtro, [o.texto])) : opciones;
  return (
    <CampoFormulario label={label} error={error} htmlFor={id} className={className} ayuda={ayuda}>
      <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder={buscar} aria-label={buscar} className={claseInput()} disabled={disabled} />
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value)} className={`${claseInput(error)} mt-2`} disabled={disabled}>
        <option value="">{filtro.trim() ? `${visibles.length} ${visibles.length === 1 ? "encontrado" : "encontrados"} · ${vacio}` : vacio}</option>
        {visibles.map((o) => (
          <option key={o.id} value={o.id}>
            {o.texto}
          </option>
        ))}
      </select>
    </CampoFormulario>
  );
}
