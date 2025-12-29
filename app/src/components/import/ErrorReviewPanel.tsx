"use client";

import { useState, useMemo } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorRowEditor } from "./ErrorRowEditor";
import type { ImportRowStatus, CorrectedRow } from "@/types/import";

interface ErrorReviewPanelProps {
  errorRows: ImportRowStatus[];
  importedCount: number;
  fieldLabels: Record<string, string>;
  onReimportCorrected: (rows: CorrectedRow[]) => Promise<void>;
  onBack: () => void;
  isReimporting: boolean;
}

export function ErrorReviewPanel({
  errorRows,
  importedCount,
  fieldLabels,
  onReimportCorrected,
  onBack,
  isReimporting,
}: ErrorReviewPanelProps) {
  const [correctedRows, setCorrectedRows] = useState<Map<number, Record<string, string>>>(
    new Map()
  );
  const [filter, setFilter] = useState<"all" | "errors" | "corrected">("all");
  const [reimportedRows, setReimportedRows] = useState<Set<number>>(new Set());

  const handleRowSave = (rowIndex: number, updatedData: Record<string, string>) => {
    setCorrectedRows((prev) => new Map(prev).set(rowIndex, updatedData));
  };

  const getRowWithCorrections = (row: ImportRowStatus): ImportRowStatus => {
    if (reimportedRows.has(row.rowIndex)) {
      return { ...row, status: "imported" };
    }
    if (correctedRows.has(row.rowIndex)) {
      return {
        ...row,
        data: correctedRows.get(row.rowIndex)!,
        status: "corrected",
      };
    }
    return row;
  };

  const correctedCount = correctedRows.size - reimportedRows.size;
  const pendingCount = errorRows.length - correctedRows.size;

  const filteredRows = useMemo(() => {
    return errorRows
      .map(getRowWithCorrections)
      .filter((row) => {
        if (row.status === "imported") return false; // No mostrar los ya reimportados
        if (filter === "errors") return row.status === "error" || row.status === "warning";
        if (filter === "corrected") return row.status === "corrected";
        return true;
      });
  }, [errorRows, correctedRows, reimportedRows, filter]);

  const handleReimport = async () => {
    const rowsToReimport: CorrectedRow[] = Array.from(correctedRows.entries())
      .filter(([rowIndex]) => !reimportedRows.has(rowIndex))
      .map(([rowIndex, data]) => ({
        rowIndex,
        data,
      }));

    if (rowsToReimport.length === 0) return;

    await onReimportCorrected(rowsToReimport);

    // Marcar filas como reimportadas
    setReimportedRows((prev) => {
      const newSet = new Set(prev);
      rowsToReimport.forEach((row) => newSet.add(row.rowIndex));
      return newSet;
    });
  };

  const totalReimported = reimportedRows.size;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="text-yellow-500" />
            Revision de Registros con Errores
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Corrige los datos problematicos antes de reimportar
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
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{importedCount + totalReimported}</p>
          <p className="text-sm text-green-700">Importados</p>
        </div>
        <div className="bg-red-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{pendingCount}</p>
          <p className="text-sm text-red-700">Pendientes</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{correctedCount}</p>
          <p className="text-sm text-blue-700">Corregidos</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-600">{totalReimported}</p>
          <p className="text-sm text-purple-700">Reimportados</p>
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
          Todos ({errorRows.length - reimportedRows.size})
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
            {reimportedRows.size === errorRows.length ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <p>Todos los registros han sido reimportados exitosamente</p>
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

      {/* Acciones */}
      <div className="flex justify-between items-center pt-4 border-t">
        <p className="text-sm text-gray-600">
          {correctedCount > 0
            ? `${correctedCount} registro(s) listos para reimportar`
            : "Corrige al menos un registro para reimportar"}
        </p>
        <button
          onClick={handleReimport}
          disabled={correctedCount === 0 || isReimporting}
          className={cn(
            "flex items-center gap-2 px-6 py-2 rounded-lg transition-colors",
            correctedCount > 0 && !isReimporting
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-300 text-gray-500 cursor-not-allowed"
          )}
        >
          <RefreshCw className={cn("h-5 w-5", isReimporting && "animate-spin")} />
          {isReimporting ? "Reimportando..." : `Reimportar ${correctedCount} registro(s)`}
        </button>
      </div>
    </div>
  );
}
