"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Piezas compartidas para marcar campos obligatorios de un formulario:
 * borde rojo + mensaje bajo el campo, y llevar la vista al primer campo con
 * error. El formulario solo guarda un `Record<campo, mensaje>` y se lo pasa
 * a cada campo; estas piezas se encargan de como se ve.
 *
 * Un campo "con error" se marca con aria-invalid="true" -- es lo que busca
 * enfocarPrimerError(), y ademas lo anuncian los lectores de pantalla.
 */

/** Clases de un input/select segun tenga o no error. */
export function claseInput(error?: string) {
  return cn(
    "w-full px-3 py-2 border rounded-lg",
    error ? "border-red-500 bg-red-50" : "border-line-strong"
  );
}

/** Mensaje de error bajo un campo (no renderiza nada si no hay error). */
export function MensajeCampo({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return <p className="mt-1 text-xs text-red-600">{mensaje}</p>;
}

/**
 * Aviso de error de una seccion completa (ej. "elige al menos un equipo").
 * Es enfocable para que enfocarPrimerError() pueda llevar la vista hasta el.
 */
export function AvisoSeccion({ mensaje, className }: { mensaje?: string; className?: string }) {
  if (!mensaje) return null;
  return (
    <div
      tabIndex={-1}
      aria-invalid="true"
      className={cn(
        "bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm outline-none",
        className
      )}
    >
      {mensaje}
    </div>
  );
}

/** Etiqueta + control + mensaje de error. El control va como children. */
export function CampoFormulario({
  label,
  obligatorio,
  error,
  ayuda,
  className,
  children,
}: {
  label: ReactNode;
  obligatorio?: boolean;
  error?: string;
  ayuda?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="field-label">
        {label}
        {obligatorio && " *"}
      </label>
      {children}
      {error ? (
        <MensajeCampo mensaje={error} />
      ) : (
        ayuda && <p className="text-xs text-fg-subtle mt-1">{ayuda}</p>
      )}
    </div>
  );
}

type PropsCampoTexto = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  label: ReactNode;
  obligatorio?: boolean;
  error?: string;
  ayuda?: ReactNode;
  value: string;
  onChange: (valor: string) => void;
};

/** Caso mas comun: un input de texto/fecha dentro de CampoFormulario. */
export function CampoTexto({
  label,
  obligatorio,
  error,
  ayuda,
  className,
  value,
  onChange,
  type = "text",
  ...rest
}: PropsCampoTexto) {
  return (
    <CampoFormulario label={label} obligatorio={obligatorio} error={error} ayuda={ayuda} className={className}>
      <input
        {...rest}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={claseInput(error)}
      />
    </CampoFormulario>
  );
}

/**
 * Lleva la vista al primer campo marcado con error (orden del DOM) y le da
 * el foco. Se llama despues de guardar los errores en el estado, por eso
 * espera al siguiente frame, cuando React ya pinto el aria-invalid.
 */
export function enfocarPrimerError() {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus({ preventScroll: true });
  });
}

/** Devuelve el mapa de errores sin los campos indicados (para setState). */
export function sinErrores(
  errores: Record<string, string>,
  ...campos: string[]
): Record<string, string> {
  if (!campos.some((c) => c in errores)) return errores;
  const next = { ...errores };
  for (const c of campos) delete next[c];
  return next;
}
