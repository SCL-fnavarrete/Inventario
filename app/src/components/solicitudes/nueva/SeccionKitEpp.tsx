"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AvisoSeccion } from "@/components/ui/CampoFormulario";

export type CategoriaKit = "kit_bienvenida" | "epp";
export type ArticuloKit = { id: string; nombre: string; categoria: CategoriaKit; cantidad: number };

const NOMBRE: Record<CategoriaKit, string> = { kit_bienvenida: "Kit de Bienvenida", epp: "EPP" };

/**
 * Kit de Bienvenida y EPP del onboarding (auditoria 28-sep-2026, 3.6). Se
 * saco de Nueva Solicitud tal cual; lo unico que cambia es que la categoria
 * abierta (solo visual) vive aqui y no en la pagina.
 *
 * Al marcar una categoria se eligen todos sus articulos (1 de cada uno) y
 * despues se pueden quitar uno a uno.
 */
export function SeccionKitEpp({
  catalogo,
  bloqueado,
  error,
  solicitado,
  onSolicitar,
  cantidades,
  onCantidades,
  limpiarError,
}: {
  catalogo: ArticuloKit[];
  /** Boleta de honorarios: Kit y EPP no corresponden. */
  bloqueado: boolean;
  error?: string;
  solicitado: Record<CategoriaKit, boolean>;
  onSolicitar: (categoria: CategoriaKit, marcado: boolean) => void;
  cantidades: Record<string, number>;
  onCantidades: (cambiar: (prev: Record<string, number>) => Record<string, number>) => void;
  limpiarError: (...campos: string[]) => void;
}) {
  const [abierta, setAbierta] = useState<CategoriaKit | null>(null);

  // Marca o desmarca varios articulos a la vez (1 unidad de cada uno).
  const elegir = (ids: string[], marcado: boolean) =>
    onCantidades((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (marcado) next[id] = 1;
        else delete next[id];
      }
      return next;
    });

  return (
    <div className="border-t pt-4">
      <h3 className="font-medium text-fg mb-1">Kit de Bienvenida y EPP</h3>
      <p className="text-xs text-fg-subtle mb-3">
        {bloqueado
          ? "No aplica para boleta de honorarios: solo se entrega a personal con contrato."
          : "Al marcar una opción se seleccionan todos sus artículos (1 de cada uno); puedes quitar los que no correspondan. No se puede crear la solicitud con artículos sin stock marcados."}
      </p>
      <AvisoSeccion mensaje={error} className="mb-3" />
      <div className="flex flex-col gap-2">
        {(["kit_bienvenida", "epp"] as const).map((categoria) => {
          const items = catalogo.filter((it) => it.categoria === categoria);
          const total = items.reduce((sum, it) => sum + it.cantidad, 0);
          const expandida = abierta === categoria;
          const requerida = solicitado[categoria];
          const nombre = NOMBRE[categoria];
          const hayElegidos = items.some((it) => (cantidades[it.id] || 0) > 0);
          return (
            <div key={categoria} className="flex flex-col">
              <div className="flex items-center gap-2">
                <label className={cn("flex items-center gap-2 flex-1", bloqueado && "opacity-50 cursor-not-allowed")}>
                  <input
                    type="checkbox"
                    checked={requerida}
                    disabled={bloqueado}
                    onChange={(e) => {
                      const marcado = e.target.checked;
                      onSolicitar(categoria, marcado);
                      limpiarError("kitEpp", "equipos");
                      elegir(items.map((it) => it.id), marcado);
                      if (marcado) setAbierta(categoria);
                    }}
                    className="rounded border-line-strong"
                  />
                  <span className="text-sm">{nombre}</span>
                </label>
                {hayElegidos && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-800 border border-primary-200">
                    Reservado
                  </span>
                )}
                <button
                  type="button"
                  aria-expanded={expandida}
                  onClick={() => setAbierta(expandida ? null : categoria)}
                  className={cn(
                    "flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border",
                    total > 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"
                  )}
                >
                  {total} disponible{total === 1 ? "" : "s"}
                  {total > 0 && (expandida ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </button>
              </div>
              {expandida && items.length > 0 && (
                <div className="ml-6 mt-1 mb-1 space-y-1">
                  <p className="text-xs text-fg-subtle">
                    {requerida
                      ? "Se reserva 1 de cada artículo marcado. Quita los que no correspondan:"
                      : `Incluye (1 de cada uno al marcar "${nombre}"):`}
                  </p>
                  {items.map((it) => {
                    const elegido = (cantidades[it.id] || 0) > 0;
                    return (
                      <label
                        key={it.id}
                        className={cn(
                          "flex items-center justify-between gap-3 text-xs",
                          !requerida && "opacity-60 cursor-not-allowed"
                        )}
                      >
                        <span className="flex items-center gap-2 text-fg-muted">
                          <input
                            type="checkbox"
                            checked={elegido}
                            disabled={!requerida}
                            onChange={(e) => {
                              elegir([it.id], e.target.checked);
                              limpiarError("kitEpp");
                            }}
                            className="rounded border-line-strong"
                          />
                          {it.nombre} <span className="text-fg-subtle">({it.cantidad} disp.)</span>
                        </span>
                        {it.cantidad < 1 ? (
                          <span className={elegido ? "text-red-600 font-medium" : "text-fg-subtle"}>Sin stock</span>
                        ) : (
                          elegido && <span className="text-fg">1 unidad</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
