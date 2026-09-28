"use client";

import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InputClave } from "@/components/ui/InputClave";

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
    // Un campo que no se puede cambiar se ve en gris, como field-input.
    "disabled:bg-surface-muted disabled:text-fg-subtle disabled:cursor-not-allowed",
    error ? "border-red-500 bg-red-50" : "border-line-strong"
  );
}

/** Mensaje de error bajo un campo (no renderiza nada si no hay error). */
export function MensajeCampo({ mensaje, id }: { mensaje?: string; id?: string }) {
  if (!mensaje) return null;
  return (
    <p id={id} className="mt-1 text-xs text-red-600">
      {mensaje}
    </p>
  );
}

/**
 * Id del mensaje (error o ayuda) de un campo, para unirlo al control con
 * aria-describedby: al entrar al campo el lector de pantalla lee el error
 * (auditoria 27-sep-2026, 2.13).
 */
export const idDescripcion = (idCampo: string) => `${idCampo}-descripcion`;

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

const CONTROLES_NATIVOS = ["input", "select", "textarea"];

/**
 * Etiqueta + control + mensaje de error. El control va como children.
 *
 * La etiqueta queda unida a su campo (SPEC 2.112.6): al tocar el texto se
 * activa el campo y los lectores de pantalla lo anuncian. Si el control es un
 * input/select/textarea nativo se le pone el id solo; si es un componente,
 * quien lo usa pasa `htmlFor` con el id que le dio (ver CampoTexto).
 */
export function CampoFormulario({
  label,
  obligatorio,
  error,
  ayuda,
  className,
  htmlFor,
  children,
}: {
  label: ReactNode;
  obligatorio?: boolean;
  error?: string;
  ayuda?: ReactNode;
  className?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const idAuto = useId();
  let control = children;
  let idControl = htmlFor;
  const hayDescripcion = !!error || !!ayuda;
  if (!idControl && isValidElement(children) && typeof children.type === "string" && CONTROLES_NATIVOS.includes(children.type)) {
    const nativo = children as ReactElement<{ id?: string; "aria-describedby"?: string }>;
    idControl = nativo.props.id ?? idAuto;
    control = cloneElement(nativo, {
      id: idControl,
      "aria-describedby": hayDescripcion ? idDescripcion(idControl) : nativo.props["aria-describedby"],
    });
  }
  // Con un componente (htmlFor), el aria-describedby lo pone quien lo usa
  // con el mismo idDescripcion(htmlFor) -- ver CampoTexto.
  const idMensaje = idControl ? idDescripcion(idControl) : undefined;
  return (
    <div className={className}>
      <label className="field-label" htmlFor={idControl}>
        {label}
        {obligatorio && " *"}
      </label>
      {control}
      {error ? (
        <MensajeCampo mensaje={error} id={idMensaje} />
      ) : (
        ayuda && (
          <p id={idMensaje} className="text-xs text-fg-subtle mt-1">
            {ayuda}
          </p>
        )
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

/**
 * Caso mas comun: un input de texto/fecha dentro de CampoFormulario. Con
 * type="password" lleva el ojo para mostrar la contraseña.
 */
export function CampoTexto({
  label,
  obligatorio,
  error,
  ayuda,
  className,
  value,
  onChange,
  type = "text",
  id,
  ...rest
}: PropsCampoTexto) {
  const idAuto = useId();
  const idCampo = id ?? idAuto;
  return (
    <CampoFormulario
      label={label}
      obligatorio={obligatorio}
      error={error}
      ayuda={ayuda}
      className={className}
      htmlFor={idCampo}
    >
      {type === "password" ? (
        <InputClave
          {...rest}
          id={idCampo}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error || ayuda ? idDescripcion(idCampo) : undefined}
          className={claseInput(error)}
        />
      ) : (
        <input
          {...rest}
          id={idCampo}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error || ayuda ? idDescripcion(idCampo) : undefined}
          className={claseInput(error)}
        />
      )}
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

/**
 * Texto del resumen de errores de un formulario, el mismo de Onboarding:
 * "Faltan o están incorrectos: Marca, Modelo."
 */
export function textoResumenErrores(
  errores: Record<string, string>,
  etiquetas: Record<string, string>
): string {
  return `Faltan o están incorrectos: ${Object.keys(errores)
    .map((campo) => etiquetas[campo] ?? campo)
    .join(", ")}.`;
}

/** Recuadro rojo con el resumen de errores, sobre el formulario. */
export function ResumenErrores({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
      {mensaje}
    </div>
  );
}

/** Clase de un control con la utilidad field-input, en rojo si tiene error. */
export function claseCampo(error?: string) {
  return cn("field-input", error && "border-red-500 bg-red-50");
}
