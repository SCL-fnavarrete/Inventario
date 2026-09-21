"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle, Download, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorRowEditor } from "./ErrorRowEditor";
import type { ImportRowStatus } from "@/types/import";

interface ErrorReviewPanelProps {
  errorRows: ImportRowStatus[];
  validCount: number;
  fieldLabels: Record<string, string>;
  onCorrectionsChange: (rowIndex: number, data: Record<string, string>) => void;
  onBack: () => void;
  // Antes, confirmar la importacion solo era posible desde el paso 4,
  // afuera de este panel -- para hacerlo, el usuario tenia que "Volver"
  // primero, perdiendo de vista lo que acababa de corregir. Javier: "al
  // editar los campos no hay ningun boton como comenzar importacion ni
  // nada, simplemente los corrijo y no hay ninguna opcion para comenzar.
  // Falto eso." (21-sep-2026, SPEC 2.60). Ahora el mismo boton que existe
  // en el paso 4 tambien esta disponible aqui.
  onConfirmImport: () => void;
  committing: boolean;
}

// Panel de correccion PREVIA a la importacion (ver SPEC: "primero detecte
// los campos, luego corrija las filas, ahi un boton para realizar
// importacion"). Antes este panel reimportaba cada fila corregida de
// inmediato contra la base -- eso es justamente lo que causaba el bug que
// se reporto (si el usuario apretaba "Cancelar" a mitad de camino, las
// filas ya reimportadas quedaban escritas igual). Ahora el panel no escribe
// nada: solo junta correcciones en memoria y se las reporta a la pagina via
// onCorrectionsChange. La escritura real ocurre una sola vez, cuando el
// usuario aprieta "Realizar importación" en la pagina.
export function ErrorReviewPanel({
  errorRows,
  validCount,
  fieldLabels,
  onCorrectionsChange,
  onBack,
  onConfirmImport,
  committing,
}: ErrorReviewPanelProps) {
  const [correctedRows, setCorrectedRows] = useState<Map<number, Record<string, string>>>(
    new Map()
  );
  const [filter, setFilter] = useState<"all" | "errors" | "corrected">("all");

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
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="text-yellow-500" />
            Revision de Registros con Errores
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Corrige los datos problematicos. Los cambios se guardan aqui y se incluyen
            recien al confirmar la importación.
          </p>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft size={16} />
          Volver
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{validCount}</p>
          <p className="text-sm text-green-700">Válidas</p>
        </div>
        <div className="bg-red-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{pendingCount}</p>
          <p className="text-sm text-red-700">Pendientes</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{correctedCount}</p>
          <p className="text-sm text-blue-700">Corregidas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter("all")}
          className={cn(
            "px-3 py-1 text-sm rounded-full transition-colors",
            filter === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          )}
        >
          Corregidos ({correctedCount})
        </button>
      </div>

      {/* Lista de filas con errores */}
      <div className="max-h-96 overflow-y-auto mb-6 border rounded-lg p-3 bg-gray-50">
        {filteredRows.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {correctedRows.size === errorRows.length ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p>Todos los registros fueron corregidos</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <XCircle className="h-12 w-12 text-gray-400" />
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
              onSave={handleRowSave}
            />
          ))
        )}
      </div>

      {/* Estado + confirmar. Mismo boton y mismo criterio que el paso 4: se
          importan las validas mas las corregidas hasta ahora, sin exigir
          que todas las pendientes queden corregidas primero. */}
      <div className="pt-4 border-t flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-gray-600">
          {correctedCount > 0
            ? `${correctedCount} registro(s) corregido(s) se incluirán en la importación junto con las ${validCount} fila(s) válida(s). ${pendingCount} fila(s) sin corregir quedarán fuera.`
            : `Corrige los registros con errores para incluirlos en la importación. Las ${validCount} fila(s) válida(s) se importarán igual.`}
        </p>
        <button
          onClick={onConfirmImport}
          disabled={committing}
          className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <Download size={20} />
          <span>{committing ? "Importando..." : "Realizar importación"}</span>
        </button>
      </div>
    </div>
  );
}
