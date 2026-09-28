"use client";

import { useId } from "react";
import { CampoTexto } from "@/components/ui/CampoFormulario";
import type { ClavesCoordinacion, Coordinacion, Medio } from "./coordinacion";

/**
 * Formulario de coordinacion (fecha, medio y lugar o datos del despacho),
 * compartido por la entrega del onboarding, el reemplazo del cambio de equipo
 * y la devolucion de la desvinculacion. Antes eran tres copias con pequeñas
 * diferencias (orden de los campos, errores que se limpiaban o no).
 */
export function SeccionCoordinacion({
  titulo,
  descripcion,
  valor,
  onChange,
  claves,
  errores,
  limpiarError,
  etiquetas,
}: {
  titulo: string;
  descripcion?: string;
  valor: Coordinacion;
  onChange: (nuevo: Coordinacion) => void;
  claves: ClavesCoordinacion;
  errores: Record<string, string>;
  limpiarError: (...campos: string[]) => void;
  /** Textos que cambian segun el tipo de solicitud. */
  etiquetas: { fechaPresencial: string; fechaDespacho: string; lugar: string };
}) {
  const idMedio = useId();

  // Cambia un dato y quita su error apenas se corrige.
  const cambiar = (campo: "fecha" | "lugar" | "ot" | "ciudad", v: string) => {
    onChange({ ...valor, [campo]: v });
    limpiarError(claves[campo]);
  };
  // Al cambiar de medio, los errores del otro medio ya no aplican.
  const elegirMedio = (medio: Medio) => {
    onChange({ ...valor, medio });
    limpiarError(...(medio === "presencial" ? [claves.ot, claves.ciudad] : [claves.lugar]));
  };

  return (
    <div>
      <h3 className="font-medium text-fg mb-1">{titulo}</h3>
      {descripcion && <p className="text-xs text-fg-subtle mb-3">{descripcion}</p>}
      <div className="space-y-3">
        <CampoTexto
          label={valor.medio === "presencial" ? etiquetas.fechaPresencial : etiquetas.fechaDespacho}
          obligatorio
          type="datetime-local"
          error={errores[claves.fecha]}
          value={valor.fecha}
          onChange={(v) => cambiar("fecha", v)}
        />
        <div>
          <p id={idMedio} className="field-label">Medio</p>
          <div role="radiogroup" aria-labelledby={idMedio} className="flex gap-4">
            {(
              [
                ["presencial", "Presencial"],
                ["chilexpress", "Despacho (Chilexpress)"],
              ] as const
            ).map(([medio, texto]) => (
              <label key={medio} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={idMedio}
                  checked={valor.medio === medio}
                  onChange={() => elegirMedio(medio)}
                />
                {texto}
              </label>
            ))}
          </div>
        </div>
        {valor.medio === "presencial" ? (
          <CampoTexto
            label={etiquetas.lugar}
            obligatorio
            error={errores[claves.lugar]}
            value={valor.lugar}
            onChange={(v) => cambiar("lugar", v)}
            placeholder="ej: Oficina Santiago, piso 4"
          />
        ) : (
          <>
            <CampoTexto
              label="N° de OT Chilexpress"
              obligatorio
              error={errores[claves.ot]}
              value={valor.ot}
              onChange={(v) => cambiar("ot", v)}
              placeholder="ej: CH-2026-004567"
            />
            <CampoTexto
              label="Ubicación de destino"
              obligatorio
              error={errores[claves.ciudad]}
              value={valor.ciudad}
              onChange={(v) => cambiar("ciudad", v)}
              placeholder="ej: Hotel HD Express, Concepción"
            />
          </>
        )}
      </div>
    </div>
  );
}
