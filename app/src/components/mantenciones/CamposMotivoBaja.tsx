"use client";

import { useEffect, useState } from "react";
import { CampoFormulario, CampoTexto, claseInput } from "@/components/ui/CampoFormulario";

/**
 * Motivo de una baja (SPEC 2.116.5): se elige de la lista administrable en
 * Configuracion > Catalogos de Activos y se puede agregar un detalle. Lo usan
 * "Dar de baja" y "Completar mantención" con resultado Sin reparación.
 */

export type MotivoBaja = { id: string; nombre: string; clave: string | null };

/** Motivos activos, para el selector. */
export function useMotivosBaja() {
  const [motivos, setMotivos] = useState<MotivoBaja[]>([]);
  useEffect(() => {
    fetch("/api/motivos-baja?activas=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMotivos(Array.isArray(data) ? data : []))
      .catch(() => setMotivos([]));
  }, []);
  return motivos;
}

/** Errores que faltan en el motivo, con las mismas reglas del servidor. */
export function erroresMotivoBaja(motivos: MotivoBaja[], motivoBajaId: string, detalle: string) {
  const faltan: Record<string, string> = {};
  if (!motivoBajaId) faltan.motivoBajaId = "Elige el motivo de la baja";
  else if (motivos.find((m) => m.id === motivoBajaId)?.clave === "otro" && !detalle.trim())
    faltan.motivoDetalle = 'Describe el motivo cuando eliges "Otro"';
  return faltan;
}

export function CamposMotivoBaja({
  motivos,
  motivoBajaId,
  detalle,
  onMotivo,
  onDetalle,
  errores,
}: {
  motivos: MotivoBaja[];
  motivoBajaId: string;
  detalle: string;
  onMotivo: (id: string) => void;
  onDetalle: (texto: string) => void;
  errores: { motivoBajaId?: string; motivoDetalle?: string };
}) {
  const pideDetalle = motivos.find((m) => m.id === motivoBajaId)?.clave === "otro";
  return (
    <>
      <CampoFormulario label="Motivo de la baja" obligatorio error={errores.motivoBajaId}>
        <select
          value={motivoBajaId}
          onChange={(e) => onMotivo(e.target.value)}
          aria-invalid={!!errores.motivoBajaId}
          className={claseInput(errores.motivoBajaId)}
        >
          <option value="">Selecciona un motivo</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </CampoFormulario>
      <CampoTexto
        label="Detalle del motivo"
        obligatorio={pideDetalle}
        value={detalle}
        onChange={onDetalle}
        error={errores.motivoDetalle}
        maxLength={500}
        placeholder={pideDetalle ? "Describe por qué se da de baja" : "Opcional: qué pasó con el equipo"}
      />
    </>
  );
}
