"use client";

import { useId } from "react";
import { CampoFormulario } from "@/shared/ui/CampoFormulario";
import { SelectorBuscable } from "@/shared/ui/SelectorBuscable";

type Opcion = { id: string; texto: string };
const textoDe = (o: Opcion) => [o.texto];
const mostrar = (o: Opcion) => o.texto;

/** Lista para elegir con el buscador adentro: se abre, se escribe y se acorta (no distingue tildes). */
export function ListaConBuscador({
  label,
  valor,
  onChange,
  opciones,
  vacio,
  buscar,
  error,
  ayuda,
  className = "lg:col-span-2",
}: {
  label: string;
  valor: string;
  onChange: (id: string) => void;
  opciones: Opcion[];
  /** Lo que dice mientras no hay nada elegido (y cuando no hay opciones). */
  vacio: string;
  buscar: string;
  error?: string;
  ayuda?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <CampoFormulario label={label} error={error} htmlFor={id} className={className} ayuda={ayuda}>
      <SelectorBuscable
        id={id}
        opciones={opciones}
        value={valor}
        onChange={onChange}
        textoDe={textoDe}
        renderOpcion={mostrar}
        etiquetaElegida={mostrar}
        placeholder={vacio}
        buscar={buscar}
        vacio="No hay opciones"
        invalido={!!error}
      />
    </CampoFormulario>
  );
}
