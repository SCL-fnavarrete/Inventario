"use client";

import {
  CONDICION_CARGADOR_POR_DEFECTO,
  opcionesCondicionCargador,
  type CondicionCargador,
  type ContextoCargador,
} from "@/modules/activos/condicionCargador";

/**
 * Selector de la condicion del cargador, compartido por onboarding, Gestion
 * TI, cambio de equipo y devoluciones. Sin valor muestra el por defecto.
 */
export function SelectCondicionCargador({
  value,
  onChange,
  contexto,
  className,
}: {
  value: CondicionCargador | "" | null | undefined;
  onChange: (valor: CondicionCargador) => void;
  contexto: ContextoCargador;
  className?: string;
}) {
  return (
    <select
      value={value || CONDICION_CARGADOR_POR_DEFECTO}
      onChange={(e) => onChange(e.target.value as CondicionCargador)}
      className={className}
    >
      {opcionesCondicionCargador(contexto).map((op) => (
        <option key={op.value} value={op.value}>
          {op.label}
        </option>
      ))}
    </select>
  );
}
