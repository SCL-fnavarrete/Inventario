"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { AssetStatusBadge } from "@/modules/activos/componentes";
import { identificadorActivo } from "@/modules/activos";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { logger } from "@/shared/logger";

export type EquipoBuscado = {
  id: string;
  numeroSerie: string | null;
  imei?: string | null;
  marca: { nombre: string };
  modelo: string;
  estado: string;
  categoria: { nombre: string };
};

const LIMITE = 30;

/**
 * Mini buscador para vincular un equipo que ya existe a una compra: la lista
 * aparece al abrirlo (con scroll) y el cuadro de arriba la filtra por serie,
 * marca, modelo o IMEI. Solo muestra equipos de la sede de la compra y deja
 * fuera los que ya estan en ella.
 */
export function BuscadorEquipoExistente({
  sedeId,
  excluirIds,
  ocupado = false,
  onElegir,
  onCerrar,
}: {
  sedeId: string;
  excluirIds: string[];
  ocupado?: boolean;
  onElegir: (equipo: EquipoBuscado) => void;
  onCerrar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<EquipoBuscado[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const busqueda = useDebouncedValue(texto.trim(), 300);

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    const params = new URLSearchParams({ limit: String(LIMITE) });
    if (busqueda) params.set("search", busqueda);
    if (sedeId) params.set("sedeId", sedeId);
    fetch(`/api/activos?${params}`)
      .then((r) => (r.ok ? r.json() : { data: [], pagination: { total: 0 } }))
      .then((data) => {
        if (!vigente) return;
        setResultados(data.data ?? []);
        setTotal(data.pagination?.total ?? 0);
      })
      .catch((error) => {
        logger.error("Error buscando equipos", error);
        if (vigente) setResultados([]);
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [busqueda, sedeId]);

  const excluidos = new Set(excluirIds);
  const visibles = resultados.filter((e) => !excluidos.has(e.id));

  return (
    <div className="mb-4 rounded-lg bg-surface-muted p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por serie, IMEI, marca o modelo..."
          aria-label="Buscar equipo"
          autoFocus
          className="field-input field-input-sm pl-9 pr-9"
        />
        <button
          aria-label="Cerrar búsqueda"
          type="button"
          onClick={onCerrar}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted"
        >
          <X size={18} />
        </button>
      </div>

      <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line bg-surface">
        {cargando ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" />
          </div>
        ) : visibles.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-subtle">No se encontraron equipos en esta sede</p>
        ) : (
          visibles.map((equipo) => (
            <button
              key={equipo.id}
              type="button"
              onClick={() => onElegir(equipo)}
              disabled={ocupado}
              className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface-muted disabled:opacity-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {equipo.marca.nombre} {equipo.modelo}
                </p>
                <p className="truncate text-xs text-fg-subtle">
                  {equipo.categoria.nombre} • {identificadorActivo(equipo, "Sin serie")}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <AssetStatusBadge status={equipo.estado} />
                <Plus size={16} className="text-primary-700" />
              </span>
            </button>
          ))
        )}
      </div>
      {!cargando && total > LIMITE && (
        <p className="mt-1 text-xs text-fg-subtle">
          Se muestran {LIMITE} de {total}: escribe para acotar la lista.
        </p>
      )}
    </div>
  );
}
