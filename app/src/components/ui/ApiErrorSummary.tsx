"use client";

import { AlertCircle } from "lucide-react";
import type { FieldErrors } from "@/lib/utils/apiErrors";

/**
 * Cartel de error de formulario (14-sep-2026, SPEC 2.37). Reemplaza el
 * mensaje generico ("Datos invalidos") que tenian casi todos los
 * formularios: si hay errores por campo (`fieldErrors`), los lista uno por
 * uno con su nombre legible; si no, muestra el mensaje general tal cual.
 *
 * `fieldLabels` es opcional -- mapea el nombre tecnico del campo (ej.
 * "rut", "categoriaId") a como se le llama en el formulario (ej. "RUT",
 * "Categoría"). Si no se pasa, o al campo no le toco entrada, se usa el
 * nombre del campo tal cual viene del backend.
 */
export function ApiErrorSummary({
  error,
  fieldErrors,
  fieldLabels = {},
}: {
  error: string | null;
  fieldErrors?: FieldErrors;
  fieldLabels?: Record<string, string>;
}) {
  if (!error) return null;

  const entries = Object.entries(fieldErrors || {});

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
      {entries.length > 0 ? (
        <div>
          <p className="font-medium text-red-700 mb-1">{error}</p>
          <ul className="list-disc list-inside space-y-0.5 text-sm text-red-700">
            {entries.map(([field, msg]) => (
              <li key={field}>
                <span className="font-medium">{fieldLabels[field] || field}:</span> {msg}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-red-700">{error}</p>
      )}
    </div>
  );
}

/**
 * Mensaje bajo un campo individual, para cuando conviene marcar el error
 * justo al lado del input además de listarlo en el resumen de arriba (ej.
 * en formularios largos). Uso: `<FieldError message={fieldErrors.rut} />`
 * debajo del input, y agregar `fieldErrors.rut && "border-red-500"` a su
 * className.
 */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}
