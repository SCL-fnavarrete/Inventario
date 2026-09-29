"use client";

import { useEffect, useState } from "react";
import { FILTROS_DATO, SIN_DATO, type ParamFiltroDato } from "@/modules/activos/filtros";

/**
 * Filtros de Activos por datos de catalogo (SPEC 2.116.6): marca, sistema
 * operativo, antivirus, licencia y motivo de baja. Cada lista trae "Todas",
 * "Sin ..." (quienes no tienen el dato) y las opciones del catalogo, tambien
 * las desactivadas: un equipo antiguo puede tener guardada una.
 */

type Opcion = { valor: string; nombre: string };
export type OpcionesFiltroDato = Partial<Record<ParamFiltroDato, Opcion[]>>;

/** Opciones de las cinco listas, pedidas una vez al abrir Activos. */
export function useOpcionesFiltroDato(): OpcionesFiltroDato {
  const [opciones, setOpciones] = useState<OpcionesFiltroDato>({});
  useEffect(() => {
    Promise.all(
      FILTROS_DATO.map(async ({ param, endpoint }) => {
        const res = await fetch(endpoint).catch(() => null);
        const lista: { id: string; nombre: string }[] = res?.ok ? await res.json() : [];
        // El motivo se filtra por id (la baja apunta a el); los demas por nombre.
        return [param, lista.map((o) => ({ valor: param === "motivoBaja" ? o.id : o.nombre, nombre: o.nombre }))];
      })
    ).then((pares) => setOpciones(Object.fromEntries(pares)));
  }, []);
  return opciones;
}

/** Texto de un valor elegido, para las etiquetas de "Filtros activos". */
export function textoFiltroDato(param: ParamFiltroDato, valor: string, opciones: OpcionesFiltroDato) {
  if (valor === SIN_DATO) return FILTROS_DATO.find((d) => d.param === param)?.sinDato ?? valor;
  return opciones[param]?.find((o) => o.valor === valor)?.nombre ?? valor;
}

export function FiltrosDatoActivo({
  valores,
  opciones,
  onChange,
}: {
  valores: Partial<Record<ParamFiltroDato, string>>;
  opciones: OpcionesFiltroDato;
  onChange: (param: ParamFiltroDato, valor: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {FILTROS_DATO.map(({ param, etiqueta, sinDato }) => (
        <label key={param} className="text-xs text-fg-muted">
          {etiqueta}
          <select
            value={valores[param] ?? ""}
            onChange={(e) => onChange(param, e.target.value || null)}
            className="field-input mt-1 text-sm"
          >
            <option value="">Todas</option>
            {sinDato && <option value={SIN_DATO}>{sinDato}</option>}
            {opciones[param]?.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
