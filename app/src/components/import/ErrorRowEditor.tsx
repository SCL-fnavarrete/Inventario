"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle, Edit2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImportRowStatus, ValidationError } from "@/types/import";

interface ErrorRowEditorProps {
  row: ImportRowStatus;
  fieldLabels: Record<string, string>;
  onSave: (rowIndex: number, updatedData: Record<string, string>) => void;
}

export function ErrorRowEditor({ row, fieldLabels, onSave }: ErrorRowEditorProps) {
  const [editedData, setEditedData] = useState<Record<string, string>>(row.data);
  const [isEditing, setIsEditing] = useState(false);

  const handleFieldChange = (field: string, value: string) => {
    setEditedData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(row.rowIndex, editedData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedData(row.data);
    setIsEditing(false);
  };

  const getFieldError = (field: string): ValidationError | undefined => {
    return row.errors.find((e) => e.field === field);
  };

  // Filtrar solo campos con labels (los que son relevantes)
  const relevantFields = Object.entries(fieldLabels).filter(([key]) => {
    return editedData[key] !== undefined || row.errors.some((e) => e.field === key);
  });

  return (
    <div
      className={cn(
        "border rounded-lg p-4 mb-3 transition-all",
        row.status === "error"
          ? "border-red-300 bg-red-50"
          : row.status === "corrected"
            ? "border-green-300 bg-green-50"
            : "border-yellow-300 bg-yellow-50"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {row.status === "corrected" ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <AlertCircle
              className={cn(
                "h-5 w-5",
                row.status === "error" ? "text-red-500" : "text-yellow-500"
              )}
            />
          )}
          <span className="font-medium">Fila {row.excelRow}</span>
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              row.status === "error"
                ? "bg-red-200 text-red-800"
                : row.status === "corrected"
                  ? "bg-green-200 text-green-800"
                  : "bg-yellow-200 text-yellow-800"
            )}
          >
            {row.status === "error"
              ? "Con errores"
              : row.status === "corrected"
                ? "Corregido"
                : "Advertencia"}
          </span>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
          >
            <Edit2 size={14} />
            Editar
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
            >
              <Save size={14} />
              Guardar
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              <X size={14} />
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Lista de errores */}
      {row.errors.length > 0 && (
        <div className="mb-3 space-y-1">
          {row.errors.map((error, idx) => (
            <div key={idx} className="text-sm text-red-700 flex items-start gap-2">
              <span className="text-red-500 mt-0.5">*</span>
              <span>{error.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Campos editables */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {relevantFields.map(([fieldKey, label]) => {
          const fieldError = getFieldError(fieldKey);
          const hasError = !!fieldError;

          return (
            <div key={fieldKey}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {label}
                {hasError && <span className="text-red-500 ml-1">*</span>}
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData[fieldKey] || ""}
                  onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                  className={cn(
                    "w-full px-2 py-1 text-sm border rounded focus:ring-2 focus:ring-blue-500 focus:outline-none",
                    hasError ? "border-red-400 bg-red-50" : "border-gray-300"
                  )}
                />
              ) : (
                <div
                  className={cn(
                    "px-2 py-1 text-sm rounded truncate",
                    hasError ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-800"
                  )}
                  title={editedData[fieldKey] || "-"}
                >
                  {editedData[fieldKey] || "-"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
