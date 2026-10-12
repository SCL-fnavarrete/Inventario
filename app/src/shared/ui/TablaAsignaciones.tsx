"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatearFecha } from "@/shared/utilidades/fechas";
import { Badge } from "@/shared/ui/Badge";
import { TablaDatos } from "@/shared/ui/TablaDatos";

/**
 * Historial de asignaciones de un equipo o de una linea: las veces que se
 * asigno a una persona, con desde cuando y hasta cuando. La ficha del equipo y
 * la de la linea usan esta misma tabla; cada una pone sus filas y, si quiere,
 * una columna extra (ej. el telefono de la linea).
 */
export type FilaAsignacion = {
  id: string;
  /** Sin fecha (dato historico importado): muestra "No registrada". */
  desde: Date | string | null;
  hasta: Date | string | null;
  /** Sigue asignada: se resalta y marca como "Actual". */
  vigente: boolean;
  persona: { nombre: string; enlace?: string; detalle?: string };
  /** Reemplaza la marca "Actual" (ej. "Histórica (sin datos)"). */
  etiqueta?: string;
  /** Contenido de la columna extra. */
  extra?: ReactNode;
};

function Persona({ persona }: { persona: FilaAsignacion["persona"] }) {
  return (
    <>
      {persona.enlace ? (
        <Link href={persona.enlace} className="text-brand hover:underline">
          {persona.nombre}
        </Link>
      ) : (
        persona.nombre
      )}
      {persona.detalle && <span className="block text-xs text-fg-subtle">{persona.detalle}</span>}
    </>
  );
}

export function TablaAsignaciones({
  filas,
  vacio,
  tituloExtra,
}: {
  filas: FilaAsignacion[];
  vacio: string;
  /** Titulo de la columna extra; sin el, no hay columna. */
  tituloExtra?: string;
}) {
  const marca = (f: FilaAsignacion) =>
    f.etiqueta ? <Badge variant="neutral">{f.etiqueta}</Badge> : f.vigente ? <Badge variant="success">Actual</Badge> : null;
  return (
    <TablaDatos
      items={filas}
      clave={(f) => f.id}
      vacio={vacio}
      resaltada={(f) => f.vigente}
      columnas={[
        {
          titulo: "Desde",
          celda: (f) => (
            <>
              {formatearFecha(f.desde, {}, "No registrada")}
              {marca(f) && <span className="ml-2">{marca(f)}</span>}
            </>
          ),
        },
        { titulo: "Hasta", celda: (f) => (f.hasta ? formatearFecha(f.hasta) : "—") },
        { titulo: "Persona", celda: (f) => <Persona persona={f.persona} /> },
        ...(tituloExtra ? [{ titulo: tituloExtra, celda: (f: FilaAsignacion) => f.extra }] : []),
      ]}
      tarjeta={(f) => (
        <>
          <p className="font-medium text-fg">
            <Persona persona={f.persona} />
          </p>
          <p className="text-xs text-fg-muted">
            {formatearFecha(f.desde, {}, "Fecha no registrada")} → {f.hasta ? formatearFecha(f.hasta) : f.vigente ? "actual" : "—"}
            {f.etiqueta ? ` · ${f.etiqueta}` : ""}
          </p>
        </>
      )}
    />
  );
}
