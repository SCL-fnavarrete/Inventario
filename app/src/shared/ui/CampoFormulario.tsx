"use client";

import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { cn } from "@/shared/cn";
import { InputClave } from "@/shared/ui/InputClave";

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

/** Lleva la vista a un campo y le da el foco. */
function irACampo(el: HTMLElement) {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

// "Marca *" o "N° de factura:" -> "marca", "n° de factura": para comparar nombres.
const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[*:]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** Nombre visible de un campo: su <label>, o su aria-label. */
function nombreDelCampo(el: HTMLElement): string {
  const label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  return normalizar(label?.textContent || el.getAttribute("aria-label") || "");
}

/**
 * Campo con error al que apunta un nombre del resumen. Se busca por su
 * etiqueta (igual, o una empieza con la otra); si los nombres no calzan, se
 * emparejan por orden los que quedan sin pareja. Sin nada, el primero con error.
 */
export function campoConError(nombres: string[], indice: number, raiz: ParentNode = document): HTMLElement | null {
  const invalidos = Array.from(raiz.querySelectorAll<HTMLElement>('[aria-invalid="true"]'));
  const etiquetas = invalidos.map(nombreDelCampo);
  const buscados = nombres.map(normalizar);
  const usados = new Set<number>();
  const destino: (number | undefined)[] = buscados.map((n) => {
    const i = etiquetas.findIndex((e, j) => !usados.has(j) && e === n);
    if (i >= 0) usados.add(i);
    return i >= 0 ? i : undefined;
  });
  buscados.forEach((n, k) => {
    if (destino[k] !== undefined) return;
    const i = etiquetas.findIndex((e, j) => !usados.has(j) && !!e && (e.startsWith(n) || n.startsWith(e)));
    if (i >= 0) {
      usados.add(i);
      destino[k] = i;
    }
  });
  const libres = invalidos.map((_, j) => j).filter((j) => !usados.has(j));
  destino.forEach((d, k) => {
    if (d === undefined && libres.length) destino[k] = libres.shift();
  });
  const elegido = destino[indice];
  return elegido !== undefined ? invalidos[elegido] : (invalidos[0] ?? null);
}

/** Nombre de un campo en un resumen de errores: al tocarlo lleva a ese campo. */
export function EnlaceCampo({ nombres, indice }: { nombres: string[]; indice: number }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // Dentro de una ventana se busca solo en ella; si no, en la pagina.
        const raiz = e.currentTarget.closest<HTMLElement>('[role="dialog"]') ?? document;
        const campo = campoConError(nombres, indice, raiz);
        if (campo) irACampo(campo);
      }}
      className="font-medium underline underline-offset-2 hover:text-red-900 dark:hover:text-red-200"
    >
      {nombres[indice]}
    </button>
  );
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

const PREFIJO_RESUMEN = "Faltan o están incorrectos: ";

/**
 * Texto del resumen de errores de un formulario, el mismo de Onboarding:
 * "Faltan o están incorrectos: Marca, Modelo."
 */
export function textoResumenErrores(
  errores: Record<string, string>,
  etiquetas: Record<string, string>
): string {
  return `${PREFIJO_RESUMEN}${Object.keys(errores)
    .map((campo) => etiquetas[campo] ?? campo)
    .join(", ")}.`;
}

/**
 * Recuadro rojo con el resumen de errores, sobre el formulario. En el resumen
 * de campos ("Faltan o están incorrectos: Marca, IMEI."), cada nombre lleva a
 * su campo; otro mensaje se muestra tal cual.
 */
export function ResumenErrores({ mensaje }: { mensaje?: string }) {
  if (!mensaje) return null;
  const nombres = mensaje.startsWith(PREFIJO_RESUMEN)
    ? mensaje.slice(PREFIJO_RESUMEN.length).replace(/\.$/, "").split(", ")
    : null;
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
      {nombres ? (
        <>
          {PREFIJO_RESUMEN}
          {nombres.map((_, i) => (
            <span key={i}>
              {i > 0 && ", "}
              <EnlaceCampo nombres={nombres} indice={i} />
            </span>
          ))}
          .
        </>
      ) : (
        mensaje
      )}
    </div>
  );
}

/** Clase de un control con la utilidad field-input, en rojo si tiene error. */
export function claseCampo(error?: string) {
  return cn("field-input", error && "border-red-500 bg-red-50");
}
