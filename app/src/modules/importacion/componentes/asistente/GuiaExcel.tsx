"use client";

import { useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { cn } from "@/shared/cn";
import type { GuiaImportacion } from "@/modules/importacion";
import { buttonClasses } from "@/shared/ui/buttonStyles";

/**
 * "Como debe ir el Excel" (SPEC 2.133): para lo que se va a importar, que hojas y
 * columnas lleva (con un ejemplo de cada una), que tiene que estar listo antes,
 * como se interpreta y que errores son los mas comunes. Sale de la misma lista de
 * campos que usa el importador, y se puede bajar como plantilla. Va plegada para
 * no empujar el asistente hacia abajo, pero siempre muestra las columnas
 * obligatorias y deja bajar la plantilla.
 */
export function GuiaExcel({ guia, descarga }: { guia: GuiaImportacion; descarga: string }) {
  const [abierta, setAbierta] = useState(false);
  const obligatorias = guia.hojas.map((h) => ({ hoja: guia.hojas.length > 1 ? h.nombre : "", columnas: h.columnas.filter((c) => c.obligatoria).map((c) => c.columna) })).filter((h) => h.columnas.length > 0);

  return (
    <section className="card p-6" aria-label="Cómo debe ir el Excel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg">Cómo debe ir el Excel</h2>
          <p className="text-sm text-fg-muted">{guia.titulo}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-expanded={abierta} onClick={() => setAbierta(!abierta)} className={buttonClasses({ variant: "outline", size: "sm" })}>
            <ChevronDown size={16} aria-hidden="true" className={cn("transition-transform", abierta && "rotate-180")} />
            <span>{abierta ? "Ocultar el detalle" : "Ver el detalle completo"}</span>
          </button>
          <a href={descarga} className={buttonClasses({ variant: "outline", size: "sm" })}>
            <Download size={16} aria-hidden="true" />
            <span>Descargar plantilla (.xlsx)</span>
          </a>
        </div>
      </div>

      <p className="mt-3 text-sm text-fg-muted">{guia.resumen}</p>
      <div className="mt-3 space-y-1 text-sm">
        {obligatorias.map((h) => (
          <p key={h.hoja} className="flex flex-wrap items-center gap-1.5 text-fg-muted">
            <span className="font-medium text-fg">{h.hoja ? `Columnas obligatorias de ${h.hoja}:` : "Columnas obligatorias:"}</span>
            {h.columnas.map((c) => (
              <span key={c} className="rounded-full bg-primary-600 px-2 py-0.5 text-xs font-medium text-white">
                {c}
              </span>
            ))}
          </p>
        ))}
      </div>

      {abierta && (
        <div className="mt-5 space-y-5 border-t border-line pt-5">
          {guia.hojas.map((h) => (
            <div key={h.nombre}>
              <h3 className="text-sm font-semibold text-fg">
                Hoja &quot;{h.nombre}&quot; <span className="font-normal text-fg-muted">— {h.para}</span>
              </h3>
              <div className="mt-2 overflow-x-auto rounded-md border border-line">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-muted">
                    <tr>
                      {["Columna", "", "Qué va", "Ejemplo"].map((t, i) => (
                        <th key={i} className="table-th">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {h.columnas.map((c) => (
                      <tr key={c.columna}>
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-fg">{c.columna}</td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className={c.obligatoria ? "rounded-full bg-primary-600 px-2 py-0.5 text-xs font-medium text-white" : "rounded-full bg-surface-muted px-2 py-0.5 text-xs text-fg-muted"}>
                            {c.obligatoria ? "Obligatoria" : "Opcional"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-fg-muted">{c.descripcion}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-fg-subtle">{c.ejemplo || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Lista titulo="Antes de importar" items={guia.antes} />
            <Lista titulo="Cómo se interpreta" items={guia.reglas} />
          </div>

          {guia.fallos.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-fg">Errores comunes y cómo arreglarlos</h3>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
                {guia.fallos.map((f) => (
                  <div key={f.motivo}>
                    <dt className="font-medium text-fg">{f.motivo}</dt>
                    <dd className="text-fg-muted">{f.solucion}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
      <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-fg-muted">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
