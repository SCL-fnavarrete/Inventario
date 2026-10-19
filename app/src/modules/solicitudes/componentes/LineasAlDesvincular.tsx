"use client";

import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { formatearNumero } from "@/modules/lineas";

type LineaPersona = {
  id: string;
  numero: string;
  tipoChip: { nombre: string; sinCelular: boolean } | null;
  activo: { id: string; marca: { nombre: string }; modelo: string } | null;
};

/**
 * Lineas de la persona que se desvincula (SPEC 2.143), solo para que el tecnico las vea:
 * las de sus celulares vuelven con el celular y sus eSIM quedan disponibles al cerrar.
 * No hay nada que elegir. Sin enlaces, para no perder lo ya llenado del formulario.
 */
export function LineasAlDesvincular({ empleadoId }: { empleadoId: string }) {
  const [lineas, setLineas] = useState<LineaPersona[]>([]);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/empleados/${empleadoId}/lineas`)
      .then((res) => (res.ok ? res.json() : []))
      .then((datos: LineaPersona[]) => {
        if (!cancelado) setLineas(datos);
      })
      .catch(() => {
        if (!cancelado) setLineas([]);
      });
    return () => {
      cancelado = true;
    };
  }, [empleadoId]);

  if (lineas.length === 0) return null;
  return (
    <div>
      <p className="field-label mb-2">Líneas de la persona</p>
      <div className="space-y-2">
        {lineas.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-muted p-3 text-sm">
            <span className="flex items-center gap-2 font-medium text-fg">
              <Phone className="h-4 w-4 text-fg-subtle" />
              {formatearNumero(l.numero)}
              {l.tipoChip && <span className="text-xs font-normal text-fg-subtle">{l.tipoChip.nombre}</span>}
            </span>
            <span className="text-xs text-fg-muted">
              {l.activo ? `Vuelve con el celular ${l.activo.marca.nombre} ${l.activo.modelo}` : "eSIM: queda disponible al desvincular"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
