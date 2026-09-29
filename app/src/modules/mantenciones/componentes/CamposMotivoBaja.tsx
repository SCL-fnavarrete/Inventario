"use client";

import { useEffect, useId, useState } from "react";
import { CampoFormulario, CampoTexto } from "@/shared/ui/CampoFormulario";
import { CatalogSelect } from "@/shared/ui/CatalogSelect";

/**
 * Motivo de una baja (SPEC 2.116.5): se elige de la lista administrable en
 * Mantenciones > Motivos de baja (o se agrega ahi mismo con "+") y se puede
 * sumar un detalle. Lo usan "Dar de baja" y "Completar mantención" con
 * resultado Sin reparación.
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
  const idMotivo = useId();
  // La lista del padre sirve para saber si es "Otro"; uno recien agregado
  // con "+" nunca es del sistema, asi que no pide detalle.
  const pideDetalle = motivos.find((m) => m.id === motivoBajaId)?.clave === "otro";
  return (
    <>
      <CampoFormulario label="Motivo de la baja" obligatorio error={errores.motivoBajaId} htmlFor={idMotivo}>
        {/* Con "+" se agrega un motivo que no esta en la lista, como el
            sistema operativo o el antivirus de un activo. */}
        <CatalogSelect
          id={idMotivo}
          endpoint="/api/motivos-baja"
          usarId
          value={motivoBajaId}
          onChange={onMotivo}
          invalido={!!errores.motivoBajaId}
          placeholder="Selecciona un motivo"
        />
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
