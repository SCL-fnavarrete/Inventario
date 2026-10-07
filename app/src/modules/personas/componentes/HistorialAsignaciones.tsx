"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import type { ItemHistorial, TipoItemHistorial } from "@/modules/personas";
import { formatearFecha } from "@/shared/utilidades/fechas";
import { Badge } from "@/shared/ui/Badge";
import { TablaAdaptable } from "@/shared/ui/TablaAdaptable";

/**
 * Historial de asignaciones de una persona (SPEC 2.132): todo lo que se le ha
 * entregado a lo largo del tiempo (equipos, Kit/EPP y lineas), con sus fechas
 * y como termino cada cosa. Es lo mismo que la ficha de un equipo muestra a
 * quien se le entrego, pero desde la persona.
 */

const TIPOS: { valor: "todo" | TipoItemHistorial; titulo: string }[] = [
  { valor: "todo", titulo: "Todo" },
  { valor: "equipo", titulo: "Equipos" },
  { valor: "kit", titulo: "Kit y EPP" },
  { valor: "linea", titulo: "Líneas" },
];
const ETIQUETA_TIPO: Record<TipoItemHistorial, string> = { equipo: "Equipo", kit: "Kit / EPP", linea: "Línea" };

const fecha = (f: ItemHistorial["desde"]) => (f ? formatearFecha(f) : "—");

export function HistorialAsignaciones({ empleadoId }: { empleadoId: string }) {
  const [items, setItems] = useState<ItemHistorial[] | null>(null);
  const [fallo, setFallo] = useState(false);
  const [tipo, setTipo] = useState<"todo" | TipoItemHistorial>("todo");
  const [soloEnUso, setSoloEnUso] = useState(false);

  useEffect(() => {
    fetch(`/api/empleados/${empleadoId}/historial`)
      .then(async (r) => (r.ok ? setItems(await r.json()) : setFallo(true)))
      .catch(() => setFallo(true));
  }, [empleadoId]);

  const visibles = (items ?? []).filter((i) => (tipo === "todo" || i.tipo === tipo) && (!soloEnUso || i.vigente));
  const enUso = (items ?? []).filter((i) => i.vigente).length;

  return (
    <section className="card" aria-labelledby="historial-asignaciones">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-surface-muted px-6 py-4">
        <div className="flex items-center gap-3">
          <History className="text-primary-700" />
          <div>
            <h3 id="historial-asignaciones" className="text-lg font-semibold">
              Historial de asignaciones
            </h3>
            {items && (
              <p className="text-xs text-fg-subtle">
                {items.length} en total · {enUso} en uso ahora
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className="field-input w-auto" aria-label="Tipo">
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.titulo}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input type="checkbox" checked={soloEnUso} onChange={(e) => setSoloEnUso(e.target.checked)} />
            Solo lo que tiene ahora
          </label>
        </div>
      </div>
      <div className="p-4">
        {fallo ? (
          <p className="py-6 text-center text-sm text-red-700 dark:text-red-400">No se pudo cargar el historial.</p>
        ) : !items ? (
          <p className="py-6 text-center text-sm text-fg-subtle">Cargando...</p>
        ) : (
          <TablaAdaptable
            items={visibles}
            clave={(i) => i.clave}
            vacio="No hay nada que mostrar con este filtro"
            resaltada={(i) => i.vigente}
            columnas={[
              { titulo: "Tipo", celda: (i) => <Badge variant="neutral">{ETIQUETA_TIPO[i.tipo]}</Badge> },
              {
                titulo: "Qué",
                celda: (i) => (
                  <>
                    {i.enlace ? (
                      <Link href={i.enlace} className="text-brand hover:underline">
                        {i.titulo}
                      </Link>
                    ) : (
                      i.titulo
                    )}
                    {i.detalle && <span className="block text-xs text-fg-subtle">{i.detalle}</span>}
                  </>
                ),
              },
              { titulo: "Desde", celda: (i) => fecha(i.desde) },
              { titulo: "Hasta", celda: (i) => (i.vigente ? "—" : fecha(i.hasta)) },
              {
                titulo: "Estado",
                className: "text-center",
                celda: (i) => <Badge variant={i.vigente ? "success" : /no devuelto|perdido/i.test(i.estado) ? "warning" : "neutral"}>{i.estado}</Badge>,
              },
            ]}
            tarjeta={(i) => (
              <>
                <p className="font-medium text-fg">
                  {i.enlace ? (
                    <Link href={i.enlace} className="text-brand hover:underline">
                      {i.titulo}
                    </Link>
                  ) : (
                    i.titulo
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                  <Badge variant="neutral">{ETIQUETA_TIPO[i.tipo]}</Badge>
                  <Badge variant={i.vigente ? "success" : "neutral"}>{i.estado}</Badge>
                  <span>
                    {fecha(i.desde)}
                    {!i.vigente && i.hasta ? ` → ${fecha(i.hasta)}` : ""}
                  </span>
                </div>
              </>
            )}
          />
        )}
      </div>
    </section>
  );
}
