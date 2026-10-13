"use client";

import { useEffect, useState } from "react";
import { logger } from "@/shared/logger";

type Articulo = { id: string; nombre: string; categoria: "kit_bienvenida" | "epp"; cantidad: number };

const CATEGORIA: Record<Articulo["categoria"], string> = { kit_bienvenida: "Kit de bienvenida", epp: "EPP" };

/**
 * Kit/EPP que sale en un despacho (SPEC 2.145): los artículos de la sede
 * origen con su stock y una cantidad por artículo. Las cantidades las lleva
 * la pantalla ({ id del artículo: texto }); vacío o 0 es "no se envía".
 */
export function SelectorKit({
  sedeId,
  cantidades,
  onChange,
}: {
  sedeId: string;
  cantidades: Record<string, string>;
  onChange: (cantidades: Record<string, string>) => void;
}) {
  const [articulos, setArticulos] = useState<Articulo[] | null>(null);

  useEffect(() => {
    let vigente = true;
    fetch(`/api/kit-items?sedeId=${sedeId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Articulo[]) => vigente && setArticulos(data.filter((a) => a.cantidad > 0)))
      .catch((error) => {
        logger.error("Error al cargar el Kit/EPP", error);
        if (vigente) setArticulos([]);
      });
    return () => {
      vigente = false;
    };
  }, [sedeId]);

  if (articulos === null) return <p className="text-sm text-fg-subtle">Cargando Kit/EPP...</p>;
  if (articulos.length === 0) {
    return <p className="text-sm text-fg-subtle">Esta sede no tiene Kit/EPP con stock para despachar.</p>;
  }

  return (
    <ul className="border border-line rounded-lg divide-y divide-line max-h-72 overflow-y-auto">
      {articulos.map((a) => (
        <li key={a.id} className="flex items-center gap-3 px-3 py-2">
          <span className="flex-1 text-sm">
            {a.nombre}
            <span className="block text-xs text-fg-subtle">
              {CATEGORIA[a.categoria]} · stock {a.cantidad}
            </span>
          </span>
          <input
            type="number"
            min={0}
            max={a.cantidad}
            inputMode="numeric"
            placeholder="0"
            aria-label={`Cantidad de ${a.nombre}`}
            value={cantidades[a.id] ?? ""}
            onChange={(e) => onChange({ ...cantidades, [a.id]: e.target.value })}
            className="field-input field-input-sm w-24 text-center"
          />
        </li>
      ))}
    </ul>
  );
}
