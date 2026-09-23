"use client";

import { useState, useMemo, useEffect } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle, Download, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorRowEditor } from "./ErrorRowEditor";
import type { ImportRowStatus } from "@/types/import";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { StatCard, StatGrid } from "@/components/ui/StatCard";

type Sede = { id: string; nombre: string };

interface ErrorReviewPanelProps {
  errorRows: ImportRowStatus[];
  validCount: number;
  fieldLabels: Record<string, string>;
  onCorrectionsChange: (rowIndex: number, data: Record<string, string>) => void;
  onBack: () => void;
  // Permite confirmar la importacion directamente desde este panel, sin
  // tener que volver al paso 4 primero.
  onConfirmImport: () => void;
  committing: boolean;
  // Vuelve a validar TODO el Excel desde cero (mismo camino que el boton
  // "Validar" inicial, que ya trae el catalogo/sedes actualizados). Se usa
  // despues de corregir algo (ej. crear una opcion de catalogo que
  // faltaba) para ver de inmediato, en este mismo panel, si ya quedo todo
  // bien o si todavia falta algo -- sin tener que cerrar esta pantalla ni
  // volver a abrirla.
  onRevalidateAll: () => void;
  revalidating: boolean;
}

// Panel de correccion PREVIA a la importacion. No escribe nada por si
// mismo: solo junta correcciones en memoria y las reporta a la pagina via
// onCorrectionsChange. La escritura real ocurre una sola vez, cuando el
// usuario aprieta "Realizar importación" en la pagina (evita dejar filas
// ya escritas si el usuario cancela a mitad de camino).
export function ErrorReviewPanel({
  errorRows,
  validCount,
  fieldLabels,
  onCorrectionsChange,
  onBack,
  onConfirmImport,
  committing,
  onRevalidateAll,
  revalidating,
}: ErrorReviewPanelProps) {
  const [correctedRows, setCorrectedRows] = useState<Map<number, Record<string, string>>>(
    new Map()
  );
  const [filter, setFilter] = useState<"all" | "errors" | "corrected">("all");

  // Sedes reales para el selector de "Sede" al corregir una fila. Se
  // fetchean una sola vez aqui (no por cada fila del editor) para no
  // repetir la misma consulta cuando hay muchas filas con errores.
  const [sedes, setSedes] = useState<Sede[]>([]);
  useEffect(() => {
    let cancelado = false;
    async function cargarSedes() {
      try {
        const res = await fetch("/api/sedes?activas=true");
        const data = await res.json();
        if (!cancelado) setSedes(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelado) setSedes([]);
      }
    }
    cargarSedes();
    return () => {
      cancelado = true;
    };
  }, []);

  const handleRowSave = (rowIndex: number, updatedData: Record<string, string>) => {
    setCorrectedRows((prev) => new Map(prev).set(rowIndex, updatedData));
    onCorrectionsChange(rowIndex, updatedData);
  };

  const correctedCount = correctedRows.size;
  const pendingCount = errorRows.length - correctedCount;

  const filteredRows = useMemo(() => {
    const getRowWithCorrections = (row: ImportRowStatus): ImportRowStatus => {
      if (correctedRows.has(row.rowIndex)) {
        return {
          ...row,
          data: correctedRows.get(row.rowIndex)!,
          status: "corrected",
        };
      }
      return row;
    };

    return errorRows.map(getRowWithCorrections).filter((row) => {
      if (filter === "errors") return row.status === "error" || row.status === "warning";
      if (filter === "corrected") return row.status === "corrected";
      return true;
    });
  }, [errorRows, correctedRows, filter]);

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
            <AlertTriangle className="text-yellow-500" />
            Revisión de Registros con Errores
          </h2>
          <p className="text-sm text-fg-muted mt-1">
            Corrige los datos problemáticos. Los cambios se guardan aquí y se incluyen
            recien al confirmar la importación.
          </p>
        </div>
        <button
          onClick={onBack}
          className={buttonClasses({ variant: "outline" })}
        >
          <ArrowLeft size={16} />
          Volver
        </button>
      </div>

      {/* Resumen */}
      <StatGrid cols={3} className="mb-6 grid-cols-3">
        <StatCard variant="soft" tone="success" label="Válidas" value={validCount} />
        <StatCard variant="soft" tone="danger" label="Pendientes" value={pendingCount} />
        <StatCard variant="soft" tone="primary" label="Corregidas" value={correctedCount} />
      </StatGrid>

      {/* Revalida todo el Excel sin salir de esta pantalla -- si despues
          de corregir algo (ej. crear una opcion de catalogo) ya no quedan
          errores, este mismo panel se cierra solo porque no hay nada mas
          que revisar (ver pagina padre). */}
      <div className="mb-4">
        <button
          onClick={onRevalidateAll}
          disabled={revalidating}
          title="Vuelve a validar todo el Excel de una, con los datos que hayas corregido mientras tanto (por ejemplo una opción de catálogo nueva)"
          className={buttonClasses({ size: "sm" })}
        >
          <RefreshCw size={14} className={revalidating ? "animate-spin" : undefined} />
          {revalidating ? "Revalidando..." : "Revalidar todo el Excel"}
        </button>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "px-3 py-1 text-sm rounded-full transition-colors",
            filter === "all" ? "bg-brand text-white" : "bg-gray-100 text-fg-muted hover:bg-gray-200"
          )}
        >
          Todos ({errorRows.length})
        </button>
        <button
          onClick={() => setFilter("errors")}
          className={cn(
            "px-3 py-1 text-sm rounded-full transition-colors",
            filter === "errors"
              ? "bg-red-600 text-white"
              : "bg-gray-100 text-fg-muted hover:bg-gray-200"
          )}
        >
          Con errores ({pendingCount})
        </button>
        <button
          onClick={() => setFilter("corrected")}
          className={cn(
            "px-3 py-1 text-sm rounded-full transition-colors",
            filter === "corrected"
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-fg-muted hover:bg-gray-200"
          )}
        >
          Corregidos ({correctedCount})
        </button>
      </div>

      {/* Lista de filas con errores */}
      <div className="max-h-96 overflow-y-auto mb-6 border rounded-lg p-3 bg-surface-muted">
        {filteredRows.length === 0 ? (
          <div className="text-center py-8 text-fg-subtle">
            {correctedRows.size === errorRows.length ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p>Todos los registros fueron corregidos</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <XCircle className="h-12 w-12 text-fg-subtle" />
                <p>No hay registros que mostrar con el filtro seleccionado</p>
              </div>
            )}
          </div>
        ) : (
          filteredRows.map((row) => (
            <ErrorRowEditor
              key={row.rowIndex}
              row={row}
              fieldLabels={fieldLabels}
              sedes={sedes}
              onSave={handleRowSave}
            />
          ))
        )}
      </div>

      {/* Estado + confirmar. Mismo boton y mismo criterio que el paso 4: se
          importan las validas mas las corregidas hasta ahora, sin exigir
          que todas las pendientes queden corregidas primero. */}
      <div className="pt-4 border-t flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-fg-muted">
          {correctedCount > 0
            ? `${correctedCount} registro(s) corregido(s) se incluirán en la importación junto con las ${validCount} fila(s) válida(s). ${pendingCount} fila(s) sin corregir quedarán fuera.`
            : `Corrige los registros con errores para incluirlos en la importación. Las ${validCount} fila(s) válida(s) se importarán igual.`}
        </p>
        <button
          onClick={onConfirmImport}
          disabled={committing}
          className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-success-hover disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <Download size={20} />
          <span>{committing ? "Importando..." : "Realizar importación"}</span>
        </button>
      </div>
    </div>
  );
}
