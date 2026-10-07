"use client";

import { AlertCircle, Download } from "lucide-react";
import { aCsv, agruparFallos, fallosParaCsv, textoDeFilas, type Fallo } from "@/modules/importacion";
import { Button } from "@/shared/ui/Button";

/**
 * Los fallos de una importacion, agrupados por motivo (SPEC 2.133): cuantas filas
 * tienen cada problema, cuales son y como arreglarlo. Se usa en la revision (lo
 * que no se va a importar) y en el resultado (lo que fallo al guardar). La lista
 * completa se baja como CSV para trabajarla en Excel.
 */
export function ResumenFallos({
  fallos,
  titulo,
  archivo = "errores-importacion",
}: {
  fallos: Fallo[];
  titulo?: string;
  /** Nombre del CSV, sin extension. */
  archivo?: string;
}) {
  if (fallos.length === 0) return null;
  const grupos = agruparFallos(fallos);

  const descargar = () => {
    const url = URL.createObjectURL(new Blob([aCsv(fallosParaCsv(fallos))], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${archivo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-lg border border-red-200 bg-red-50/60 p-4 dark:border-red-900 dark:bg-red-950/20" aria-label="Por qué fallaron las filas">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
          <AlertCircle size={18} aria-hidden="true" />
          {titulo ?? `${fallos.length} fila${fallos.length === 1 ? "" : "s"} con problemas`} · {grupos.length} motivo{grupos.length === 1 ? "" : "s"}
        </h3>
        <Button variant="outline" size="sm" leftIcon={<Download size={16} />} onClick={descargar}>
          Descargar lista (.csv)
        </Button>
      </div>

      <ul className="space-y-3">
        {grupos.map((g) => (
          <li key={g.titulo} className="rounded-md border border-line bg-surface p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-fg">{g.titulo}</p>
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
                {g.cantidad} fila{g.cantidad === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-fg-subtle">{textoDeFilas(g.filas)}</p>
            {g.solucion && (
              <p className="mt-2 text-sm text-fg-muted">
                <span className="font-medium text-fg">Cómo arreglarlo:</span> {g.solucion}
              </p>
            )}
            {(g.titulo !== g.ejemplo || g.detalle.length > 0) && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-fg-muted hover:text-fg">Ver el detalle de cada fila</summary>
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                  {g.detalle.slice(0, 200).map((d) => (
                    <li key={`${d.fila}-${d.mensaje}`} className="text-fg-muted">
                      <span className="font-medium text-fg">Fila {d.fila}</span>
                      {d.referencia ? <span className="text-fg-subtle"> ({d.referencia})</span> : null}: {d.mensaje}
                    </li>
                  ))}
                  {g.detalle.length > 200 && <li className="text-fg-subtle">…y {g.detalle.length - 200} más (están en el CSV).</li>}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
