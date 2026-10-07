"use client";

import { useEffect, useState } from "react";
import { formatearClp } from "@/shared/utilidades/moneda";
import { StatCard, StatGrid } from "@/shared/ui/StatCard";

/**
 * Panel de Activos > Lineas (SPEC 2.131), con los mismos filtros de la lista.
 * Arriba, cuantas lineas hay de cada grupo: al pulsar una tarjeta se filtra la
 * lista. Abajo, los costos y los desgloses (por estado, plan, tipo de chip,
 * operador y sede), donde cada fila tambien filtra. `version` cambia al guardar.
 */

type Suma = { lineas: number; costo: number };
type Grupo = Suma & { valor: string; nombre: string };
type Indicadores = {
  tarjetas: {
    total: number;
    activas: { lineas: number; estadoId: string | null };
    porConfirmar: { lineas: number; estadoId: string | null };
    sinAsignar: number;
    revisar: number;
    deBaja: { lineas: number; estadoId: string | null };
  };
  total: Suma;
  vigentes: Suma;
  deBaja: Suma;
  asignadas: Suma;
  sinAsignar: Suma;
  desvinculadas: Suma;
  porEstado: Grupo[];
  porPlan: Grupo[];
  porTipoChip: Grupo[];
  porOperador: Grupo[];
  porSede: Grupo[];
  personas: { activas: number; conLinea: number; sinLinea: number };
  meses: { mes: string; lineas: number; costo: number }[];
};

/** Lo que cambia una tarjeta: el estado, la asignacion y "para revisar" juntos. */
type Grupo3 = { estado: string | null; asignacion: string | null; revisar: string | null };

const lineas = (n: number) => `${n} ${n === 1 ? "línea" : "líneas"}`;
const pct = (n: number, de: number) => (de ? `${Math.round((n / de) * 1000) / 10}%` : "—");
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

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
            <th className="pb-1 text-right font-normal">Costo mensual</th>
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
              <td className="py-1 text-right text-fg">{formatearClp(g.costo)}</td>
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
  /** Estado, asignacion y "revisar" elegidos, para marcar la tarjeta. */
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
  const maximo = Math.max(...d.meses.map((m) => m.costo), 1);
  const es = (g: Grupo3) => g.estado === actual.estado && g.asignacion === actual.asignacion && g.revisar === actual.revisar;
  const tarjeta = (g: Grupo3) => ({ onClick: () => onFiltrar(es(g) ? { estado: null, asignacion: null, revisar: null } : g), activa: es(g) });
  const grupo = (estado: string | null, asignacion: string | null = null, revisar: string | null = null): Grupo3 => ({ estado, asignacion, revisar });

  return (
    <section className="space-y-4" aria-label="Indicadores">
      {/* Cuantas lineas hay de cada grupo, con los demas filtros puestos. Pulsar filtra la lista. */}
      <StatGrid cols={6}>
        <StatCard label="Total" value={t.total} hint="todas, también de baja" tone="primary" onClick={() => onFiltrar({ estado: null, asignacion: null, revisar: null })} activa={es(grupo(null))} />
        {t.activas.estadoId && <StatCard label="Activas" value={t.activas.lineas} tone="success" {...tarjeta(grupo(t.activas.estadoId))} />}
        {t.porConfirmar.estadoId && (
          <StatCard label="Por confirmar" value={t.porConfirmar.lineas} hint="¿siguen contratadas? ¿de quién son?" tone="warning" {...tarjeta(grupo(t.porConfirmar.estadoId))} />
        )}
        <StatCard label="Sin asignar" value={t.sinAsignar} hint="vigentes sin persona" tone="warning" {...tarjeta(grupo("vigentes", "sin"))} />
        <StatCard label="Para revisar" value={t.revisar} hint="en celular de baja o de alguien que se fue" tone="danger" {...tarjeta(grupo(null, null, "1"))} />
        {t.deBaja.estadoId && <StatCard label="Dadas de baja" value={t.deBaja.lineas} {...tarjeta(grupo(t.deBaja.estadoId))} />}
      </StatGrid>

      <StatGrid cols={3}>
        {/* Costos: la suma del precio mensual de cada linea, tal como esta hoy. Vigentes = asignadas + sin asignar. */}
        <StatCard
          label="Costo de líneas vigentes"
          value={formatearClp(d.vigentes.costo)}
          hint={`${lineas(d.vigentes.lineas)} vigentes · suma del precio mensual`}
          tone="success"
        />
        <StatCard
          label="Costo de líneas asignadas"
          value={formatearClp(d.asignadas.costo)}
          hint={`${lineas(d.asignadas.lineas)} vigentes con persona · ${pct(d.asignadas.lineas, d.vigentes.lineas)} de las vigentes`}
          tone="primary"
        />
        <StatCard
          label="Costo de líneas sin asignar"
          value={formatearClp(d.sinAsignar.costo)}
          hint={`${lineas(d.sinAsignar.lineas)} vigentes sin persona · ${pct(d.sinAsignar.lineas, d.vigentes.lineas)} de las vigentes`}
          tone="warning"
        />
        <StatCard label="Costo de líneas de baja" value={formatearClp(d.deBaja.costo)} hint={`${lineas(d.deBaja.lineas)} · precio que tenían`} />
        <StatCard label="Suma de todas las líneas" value={formatearClp(d.total.costo)} hint={`${lineas(d.total.lineas)}: vigentes + de baja`} />
        <StatCard
          label="Personas activas con línea"
          value={`${d.personas.conLinea} de ${d.personas.activas}`}
          hint={`${d.personas.sinLinea} sin línea vigente (en su celular o en su teléfono personal)`}
        />
        {d.desvinculadas.lineas > 0 && (
          <StatCard
            label="Costo de líneas de personas desvinculadas"
            value={formatearClp(d.desvinculadas.costo)}
            hint={`${lineas(d.desvinculadas.lineas)} en su teléfono personal: recuperar o dar de baja`}
            tone="danger"
          />
        )}
      </StatGrid>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-semibold text-fg">Costo por mes (todas las líneas vigentes)</h3>
        <div className="flex h-36 items-end gap-2" role="img" aria-label="Costo de las líneas en los últimos 12 meses">
          {d.meses.map((m) => (
            <div key={m.mes} className="flex h-full flex-1 flex-col items-center gap-1" title={`${nombreMes(m.mes)}: ${formatearClp(m.costo)} · ${lineas(m.lineas)}`}>
              {/* La barra se mide contra este espacio, que ocupa todo el alto menos la etiqueta. */}
              <div className="flex w-full flex-1 items-end">
                <div className="w-full rounded-t bg-primary-600" style={{ height: `${(m.costo / maximo) * 100}%`, minHeight: m.costo ? 2 : 0 }} />
              </div>
              <span className="text-[10px] text-fg-subtle">{nombreMes(m.mes)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-fg-subtle">
          Según el precio y el estado que regían cada mes. Antes de la fecha de alta o importación de una línea, no cuenta. No cambia con los filtros.
        </p>
      </div>

      {/* Desgloses de las lineas que deja ver el filtro; cada fila filtra por ella. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Tabla titulo="Por estado" grupos={d.porEstado} onElegir={(g) => onFiltrar({ estado: g.valor, revisar: null })} />
        <Tabla titulo="Por plan" grupos={d.porPlan} onElegir={(g) => onFiltrar({ plan: g.valor })} />
        <Tabla titulo="Por tipo de chip" grupos={d.porTipoChip} onElegir={(g) => onFiltrar({ tipoChip: g.valor })} />
        <Tabla titulo="Por operador" grupos={d.porOperador} onElegir={(g) => onFiltrar({ operador: g.valor })} />
        <Tabla titulo="Por sede" grupos={d.porSede} onElegir={(g) => onFiltrar({ sede: g.valor })} />
      </div>
    </section>
  );
}
