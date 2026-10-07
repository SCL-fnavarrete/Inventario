"use client";

import { useId, type ReactNode } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";
import { cn } from "@/shared/cn";
import { CampoFormulario, claseInput } from "@/shared/ui/CampoFormulario";

/**
 * Piezas que comparten todas las importaciones (SPEC 2.133): los mismos pasos,
 * la misma carga de archivo, el mismo mapeo de columnas y el mismo avance. Cada
 * importacion (equipos, lineas, historial) solo aporta lo suyo.
 */

export const PASOS_IMPORTACION = ["Archivo", "Columnas", "Revisión", "Importar"] as const;

/** Los cuatro pasos, con el actual resaltado. */
export function Pasos({ actual, pasos = PASOS_IMPORTACION }: { actual: number; pasos?: readonly string[] }) {
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label="Pasos de la importación">
      {pasos.map((t, i) => (
        <li
          key={t}
          aria-current={actual === i + 1 ? "step" : undefined}
          className={cn("rounded-full px-3 py-1", actual === i + 1 ? "bg-primary-600 text-white" : i + 1 < actual ? "bg-primary-50 text-primary-800 dark:bg-primary-950/40 dark:text-primary-200" : "bg-surface-muted text-fg-muted")}
        >
          {i + 1}. {t}
        </li>
      ))}
    </ol>
  );
}

/** Zona para elegir el archivo .xlsx: muestra su nombre y tamaño, y deja quitarlo. */
export function CargaArchivo({ archivo, onElegir, onQuitar, deshabilitado }: { archivo: File | null; onElegir: (f: File) => void; onQuitar: () => void; deshabilitado?: boolean }) {
  const id = useId();
  return (
    <div className={cn("rounded-lg border-2 border-dashed p-8 text-center transition-colors", archivo ? "border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950/30" : "border-line-strong")}>
      <input
        id={id}
        type="file"
        accept=".xlsx"
        className="sr-only"
        disabled={deshabilitado}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onElegir(f);
          e.target.value = "";
        }}
      />
      <label htmlFor={id} className="cursor-pointer">
        {archivo ? (
          <span className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="h-10 w-10 text-green-600" aria-hidden="true" />
            <span className="text-left">
              <span className="block font-medium text-fg">{archivo.name}</span>
              <span className="block text-sm text-fg-muted">{(archivo.size / 1024).toFixed(1)} KB</span>
            </span>
            <button
              type="button"
              aria-label="Quitar archivo"
              onClick={(e) => {
                e.preventDefault();
                onQuitar();
              }}
              className="rounded p-1 hover:bg-green-100 dark:hover:bg-green-900/40"
            >
              <X className="h-5 w-5 text-green-700 dark:text-green-400" />
            </button>
          </span>
        ) : (
          <span className="block">
            <Upload className="mx-auto mb-3 h-10 w-10 text-fg-subtle" aria-hidden="true" />
            <span className="block text-fg-muted">
              Elige el archivo Excel o <span className="font-medium text-primary-700 dark:text-primary-300">haz clic para seleccionar</span>
            </span>
            <span className="mt-1 block text-sm text-fg-subtle">Formato .xlsx. Si tienes un .xls antiguo, ábrelo en Excel y guárdalo como .xlsx.</span>
          </span>
        )}
      </label>
    </div>
  );
}

export interface CampoMapeo {
  key: string;
  etiqueta: string;
  obligatorio?: boolean;
  /** Que dato va en esa columna. */
  ayuda?: string;
}
export interface GrupoMapeo {
  titulo: string;
  descripcion?: string;
  campos: CampoMapeo[];
}

/** Para cada campo del sistema, que columna del Excel es (con un ejemplo de lo que trae). */
export function MapeoColumnas({
  grupos,
  encabezados,
  mapeo,
  onCambio,
  errores = {},
  ejemplo,
}: {
  grupos: GrupoMapeo[];
  encabezados: string[];
  mapeo: Record<string, string | undefined>;
  onCambio: (campo: string, columna: string) => void;
  errores?: Record<string, string>;
  /** Un valor de ejemplo de la columna, de la primera fila que lo tenga. */
  ejemplo?: (columna: string, campo: string) => string | undefined;
}) {
  return (
    <div className="space-y-6">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <h3 className="mb-1 text-sm font-semibold text-fg">{g.titulo}</h3>
          {g.descripcion && <p className="mb-3 text-xs text-fg-muted">{g.descripcion}</p>}
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {g.campos.map((c) => {
              const columna = mapeo[c.key];
              const ej = columna ? ejemplo?.(columna, c.key) : undefined;
              return (
                <CampoFormulario
                  key={c.key}
                  label={c.etiqueta}
                  obligatorio={c.obligatorio}
                  error={errores[`map.${c.key}`]}
                  ayuda={[ej ? `Ej: ${ej}` : "", c.ayuda ?? ""].filter(Boolean).join(" · ") || undefined}
                >
                  <select
                    value={columna ?? ""}
                    onChange={(e) => onCambio(c.key, e.target.value)}
                    className={claseInput(errores[`map.${c.key}`])}
                    aria-label={`Columna para ${c.etiqueta}`}
                  >
                    <option value="">No importar</option>
                    {encabezados.map((h, i) => (
                      <option key={`${i}-${h}`} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </CampoFormulario>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Barra de avance de una importacion que se envia en tandas. */
export function AvanceImportacion({ hechas, total, texto = "Importando..." }: { hechas: number; total: number; texto?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4" aria-live="polite">
      <div className="mb-2 flex justify-between text-sm text-fg">
        <span>{texto}</span>
        <span>
          {hechas} de {total} filas
        </span>
      </div>
      <div role="progressbar" aria-label="Avance de la importación" aria-valuemin={0} aria-valuemax={total} aria-valuenow={hechas} className="h-2 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full bg-primary-600 transition-all" style={{ width: `${(hechas / Math.max(total, 1)) * 100}%` }} />
      </div>
    </div>
  );
}

/** Un bloque con titulo dentro de un paso. */
export function BloquePaso({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <div className="card space-y-4 p-6">
      {titulo && <h2 className="text-lg font-semibold text-fg">{titulo}</h2>}
      {children}
    </div>
  );
}
