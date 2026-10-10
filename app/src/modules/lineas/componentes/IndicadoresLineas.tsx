"use client";

import { useEffect, useState } from "react";
import { StatCard, StatGrid } from "@/shared/ui/StatCard";

/**
 * Panel de Activos > Lineas (SPEC 2.131), con los mismos filtros de la lista.
 * Arriba, cuantas lineas hay de cada grupo: al pulsar una tarjeta se filtra la
 * lista. Abajo, los desgloses (por estado, tipo de chip y operador), donde cada
 * fila tambien filtra. `version` cambia al guardar.
 */

type Grupo = { valor: string; nombre: string; lineas: number };
type Indicadores = {
  tarjetas: {
    total: number;
    activas: { lineas: number; estadoId: string | null };
    disponibles: number;
    deBaja: { lineas: number; estadoId: string | null };
  };
  porEstado: Grupo[];
  porTipoChip: Grupo[];
  porOperador: Grupo[];
  personas: { activas: number; conLinea: number; sinLinea: number };
};

/** Lo que cambia una tarjeta: el estado y la asignacion juntos. */
type Grupo3 = { estado: string | null; asignacion: string | null };

function Tabla({ titulo, grupos, onElegir }: { titulo: string; grupos: Grupo[]; onElegir?: (g: Grupo) => void }) {
  if (grupos.length === 0) return null;
  return (
    <div className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-fg">{titulo}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-fg-subtle">
            <th className="pb-1 text-left font-normal">&nbsp;</th>
            <th className="pb-1 text-right font-normal">Líneas</th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.valor} className="border-t border-line first:border-0">
              <td className="py-1 text-fg-muted">
                {onElegir ? (
                  <button type="button" onClick={() => onElegir(g)} className="text-left text-brand hover:underline" title={`Filtrar por ${g.nombre}`}>
                    {g.nombre}
                  </button>
                ) : (
                  g.nombre
                )}
              </td>
              <td className="py-1 text-right text-fg-subtle">{g.lineas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IndicadoresLineas({
  filtros,
  actual,
  version,
  onFiltrar,
}: {
  /** Los filtros de la lista, como query string. */
  filtros: string;
  /** Estado y asignacion elegidos, para marcar la tarjeta. */
  actual: Grupo3;
  version: number;
  onFiltrar: (cambios: Record<string, string | null>) => void;
}) {
  const [d, setD] = useState<Indicadores | null>(null);

  useEffect(() => {
    fetch(`/api/lineas/indicadores?${filtros}`).then(async (r) => r.ok && setD(await r.json()));
  }, [filtros, version]);

  if (!d) return null;
  const t = d.tarjetas;
  const es = (g: Grupo3) => g.estado === actual.estado && g.asignacion === actual.asignacion;
  const tarjeta = (g: Grupo3) => ({ onClick: () => onFiltrar(es(g) ? { estado: null, asignacion: null } : g), activa: es(g) });
  const grupo = (estado: string | null, asignacion: string | null = null): Grupo3 => ({ estado, asignacion });

  return (
    <section className="space-y-4" aria-label="Indicadores">
      {/* Cuantas lineas hay de cada grupo, con los demas filtros puestos. Pulsar filtra la lista. */}
      <StatGrid cols={4}>
        <StatCard label="Total" value={t.total} hint="todas, también de baja" tone="primary" onClick={() => onFiltrar({ estado: null, asignacion: null })} activa={es(grupo(null))} />
        {t.activas.estadoId && <StatCard label="Activas" value={t.activas.lineas} tone="success" {...tarjeta(grupo(t.activas.estadoId))} />}
        <StatCard label="Disponibles" value={t.disponibles} hint="activas sin persona" tone="warning" {...tarjeta(grupo("vigentes", "sin"))} />
        {t.deBaja.estadoId && <StatCard label="De baja" value={t.deBaja.lineas} {...tarjeta(grupo(t.deBaja.estadoId))} />}
      </StatGrid>

      <StatGrid cols={3}>
        <StatCard
          label="Personas activas con línea"
          value={`${d.personas.conLinea} de ${d.personas.activas}`}
          hint={`${d.personas.sinLinea} sin línea vigente (en su celular o en su teléfono personal)`}
        />
      </StatGrid>

      {/* Desgloses de las lineas que deja ver el filtro; cada fila filtra por ella. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Tabla titulo="Por estado" grupos={d.porEstado} onElegir={(g) => onFiltrar({ estado: g.valor })} />
        <Tabla titulo="Por tipo de chip" grupos={d.porTipoChip} onElegir={(g) => onFiltrar({ tipoChip: g.valor })} />
        <Tabla titulo="Por operador" grupos={d.porOperador} onElegir={(g) => onFiltrar({ operador: g.valor })} />
      </div>
    </section>
  );
}
