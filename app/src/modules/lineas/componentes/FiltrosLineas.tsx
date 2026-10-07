"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  ASIGNACION_LINEA,
  ESTADO_LINEA_GRUPOS,
  FILTROS_CATALOGO_LINEA,
  SIN_DATO_LINEA,
  type ParamCatalogoLinea,
} from "@/modules/lineas";
import type { Opcion } from "@/modules/lineas/componentes/tipos";

/**
 * Filtros de Activos > Lineas (SPEC 2.131): estado, asignacion, plan, tipo de
 * chip, operador y sede (todas con "Sin ..."). Se combinan; los elegidos se muestran con una X
 * para quitarlos. Los valores viven en la URL (los maneja LineasView).
 */

export type ValoresFiltro = Record<string, string>;
type Opciones = Partial<Record<ParamCatalogoLinea | "estado", Opcion[]>>;

/** Las opciones de cada catalogo, pedidas una vez. */
export function useOpcionesFiltroLineas(): Opciones {
  const [opciones, setOpciones] = useState<Opciones>({});
  useEffect(() => {
    const pedir = (endpoint: string) =>
      fetch(endpoint)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []) as Promise<Opcion[]>;
    Promise.all([
      pedir("/api/lineas/catalogos/estados").then((l) => ["estado", l] as const),
      ...FILTROS_CATALOGO_LINEA.map((f) => pedir(f.endpoint).then((l) => [f.param, l] as const)),
    ]).then((pares) => setOpciones(Object.fromEntries(pares)));
  }, []);
  return opciones;
}

/** Texto de un filtro elegido, para la etiqueta de "Filtros activos". */
function texto(param: string, valor: string, opciones: Opciones): string {
  if (param === "estado") return ESTADO_LINEA_GRUPOS[valor as keyof typeof ESTADO_LINEA_GRUPOS] ?? opciones.estado?.find((o) => o.id === valor)?.nombre ?? valor;
  if (param === "asignacion") return ASIGNACION_LINEA[valor as keyof typeof ASIGNACION_LINEA] ?? valor;
  if (param === "revisar") return "Para revisar";
  if (param === "q") return `"${valor}"`;
  const f = FILTROS_CATALOGO_LINEA.find((x) => x.param === param);
  if (valor === SIN_DATO_LINEA) return f?.sinDato ?? valor;
  return opciones[param as ParamCatalogoLinea]?.find((o) => o.id === valor)?.nombre ?? valor;
}

const ETIQUETA: Record<string, string> = {
  estado: "Estado",
  asignacion: "Asignación",
  revisar: "Revisar",
  q: "Búsqueda",
  ...Object.fromEntries(FILTROS_CATALOGO_LINEA.map((f) => [f.param, f.etiqueta])),
};

export function FiltrosLineas({
  valores,
  opciones,
  onCambio,
}: {
  valores: ValoresFiltro;
  opciones: Opciones;
  onCambio: (cambios: Record<string, string | null>) => void;
}) {
  const elegidos = Object.entries(valores).filter(([, v]) => v);
  const campo = "field-input mt-1 text-sm";

  return (
    <div className="card space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <label className="text-xs text-fg-muted">
          Estado
          <select value={valores.estado ?? ""} onChange={(e) => onCambio({ estado: e.target.value || null, revisar: null })} className={campo}>
            <option value="">Todos</option>
            {/* Un grupo que puso una tarjeta (ej. "Sin asignar" son las vigentes) se muestra mientras este elegido. */}
            {valores.estado && valores.estado in ESTADO_LINEA_GRUPOS && (
              <option value={valores.estado}>{ESTADO_LINEA_GRUPOS[valores.estado as keyof typeof ESTADO_LINEA_GRUPOS]}</option>
            )}
            {opciones.estado?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-fg-muted">
          Asignación
          <select value={valores.asignacion ?? ""} onChange={(e) => onCambio({ asignacion: e.target.value || null })} className={campo}>
            <option value="">Todas</option>
            {Object.entries(ASIGNACION_LINEA).map(([valor, nombre]) => (
              <option key={valor} value={valor}>
                {nombre}
              </option>
            ))}
          </select>
        </label>
        {FILTROS_CATALOGO_LINEA.map(({ param, etiqueta, sinDato }) => (
          <label key={param} className="text-xs text-fg-muted">
            {etiqueta}
            <select value={valores[param] ?? ""} onChange={(e) => onCambio({ [param]: e.target.value || null })} className={campo}>
              <option value="">Todas</option>
              <option value={SIN_DATO_LINEA}>{sinDato}</option>
              {opciones[param]?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {elegidos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-fg-muted">Filtros activos:</span>
          {elegidos.map(([param, valor]) => (
            <span key={param} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-primary-800 dark:bg-primary-950/40 dark:text-primary-200">
              {ETIQUETA[param] ?? param}: {texto(param, valor, opciones)}
              <button type="button" onClick={() => onCambio({ [param]: null })} aria-label={`Quitar filtro ${ETIQUETA[param] ?? param}`} className="rounded-full p-0.5 hover:bg-primary-100 dark:hover:bg-primary-900/40">
                <X size={14} />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => onCambio(Object.fromEntries(elegidos.map(([p]) => [p, null])))} className="text-sm font-medium text-brand hover:underline">
            Limpiar
          </button>
        </div>
      )}
    </div>
  );
}
