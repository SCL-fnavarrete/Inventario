"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle, Edit2, Save, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { CatalogSelect } from "@/components/ui/CatalogSelect";
import { parseEstado, parseCondicion } from "@/lib/importacion/estadoCondicion";
import type { ImportRowStatus, ValidationError } from "@/types/import";
import type { EstadoActivo, CondicionActivo } from "@prisma/client";
import {
  CONDICION_ACTIVO_LABEL as condicionLabels,
  ESTADO_ACTIVO_LABEL as estadoLabels,
} from "@/lib/constants/estadosActivo";

type Sede = { id: string; nombre: string };

// Sin estos tres la fila no se puede importar (ver procesarFila).
const CAMPOS_OBLIGATORIOS: Record<string, string> = {
  marca: "Escribe la marca",
  modelo: "Escribe el modelo",
  numeroSerie: "Escribe el número de serie",
};

interface ErrorRowEditorProps {
  row: ImportRowStatus;
  fieldLabels: Record<string, string>;
  sedes: Sede[];
  onSave: (rowIndex: number, updatedData: Record<string, string>) => void;
}

// Campos importados que alimentan directamente un catalogo administrable
// (CatalogSelect), en vez de dominio fijo o texto libre.
const CATALOG_FIELD_ENDPOINTS: Record<string, string> = {
  sistemaOperativo: "/api/sistemas-operativos",
  antivirus: "/api/antivirus",
  // La columna de importacion "microsoft365" alimenta el campo
  // tipoLicenciaMicrosoft365 del activo (ver src/lib/importacion/procesarFila.ts).
  microsoft365: "/api/licencias-m365",
};

// El Excel trae el estado/condicion como texto libre ("Disponible",
// "ACTIVO", con o sin tildes) pero el <select> compara contra la palabra
// EXACTA del enum ("disponible"). Sin esto, una fila que ya trae un dato
// valido se ve en blanco en el selector -- como si no tuviera nada -- solo
// porque no coincide letra por letra, obligando a elegirlo de nuevo aunque
// ya estuviera bien. Se usa la misma interpretacion que ya corre en el
// servidor (parseEstado/parseCondicion) para no duplicar el criterio de que
// cuenta como reconocido.
function normalizarEstadoCondicion(data: Record<string, string>): Record<string, string> {
  const normalizado = { ...data };
  if (normalizado.estado) {
    const estado = parseEstado(normalizado.estado);
    if (estado) normalizado.estado = estado;
  }
  if (normalizado.condicion) {
    const condicion = parseCondicion(normalizado.condicion);
    if (condicion) normalizado.condicion = condicion;
  }
  return normalizado;
}

export function ErrorRowEditor({ row, fieldLabels, sedes, onSave }: ErrorRowEditorProps) {
  const [editedData, setEditedData] = useState<Record<string, string>>(() =>
    normalizarEstadoCondicion(row.data)
  );
  const [isEditing, setIsEditing] = useState(false);
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.105):
  // los obligatorios vacios se marcan al guardar.
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(fieldLabels);
  // Campos que ya se corrigieron: dejan de mostrar el error que trajo la fila.
  const [corregidos, setCorregidos] = useState<Set<string>>(new Set());

  const handleFieldChange = (field: string, value: string) => {
    setEditedData((prev) => ({ ...prev, [field]: value }));
    limpiar(field);
    setCorregidos((prev) => new Set(prev).add(field));
  };

  const handleSave = () => {
    const faltan: Record<string, string> = {};
    for (const [campo, mensaje] of Object.entries(CAMPOS_OBLIGATORIOS)) {
      if (campo in fieldLabels && !editedData[campo]?.trim()) faltan[campo] = mensaje;
    }
    if (reportar(faltan)) return;
    onSave(row.rowIndex, editedData);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedData(normalizarEstadoCondicion(row.data));
    setCorregidos(new Set());
    reportar({});
    setIsEditing(false);
  };

  const getFieldError = (field: string): ValidationError | undefined => {
    return row.errors.find((e) => e.field === field);
  };

  /** Error del campo: el de esta pantalla o, si no se ha corregido, el de la fila. */
  const errorDe = (field: string): string | undefined =>
    errores[field] ?? (corregidos.has(field) ? undefined : getFieldError(field)?.message);

  // Filtrar solo campos con labels (los que son relevantes)
  const relevantFields = Object.entries(fieldLabels).filter(([key]) => {
    return editedData[key] !== undefined || row.errors.some((e) => e.field === key);
  });
  const erroresGenerales = row.errors.filter(
    (e) => !e.field || !relevantFields.some(([key]) => key === e.field)
  );

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
            className={buttonClasses({ variant: "outline", size: "sm" })}
          >
            <Edit2 size={14} />
            Editar
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className={buttonClasses({ size: "sm", className: "bg-success hover:bg-success-hover" })}
            >
              <Save size={14} />
              Guardar
            </button>
            <button onClick={handleCancel} className={buttonClasses({ variant: "outline", size: "sm" })}>
              <X size={14} />
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Lista de errores */}
      {isEditing && <div className="mb-3"><ResumenErrores mensaje={resumen} /></div>}
      {erroresGenerales.length > 0 && (
        <div className="mb-3 space-y-1">
          {erroresGenerales.map((error, idx) => (
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
          const error = errorDe(fieldKey);

          return (
            <div key={fieldKey}>
              <label className="block text-xs font-medium text-fg-muted mb-1">
                {label}
                {fieldKey in CAMPOS_OBLIGATORIOS && " *"}
              </label>
              {isEditing ? (
                renderEditControl(fieldKey, editedData[fieldKey] || "", handleFieldChange, error, sedes)
              ) : (
                <div
                  className={cn(
                    "px-2 py-1 text-sm rounded truncate",
                    error ? "bg-red-100 text-red-800" : "bg-gray-100 text-fg"
                  )}
                  title={editedData[fieldKey] || "-"}
                >
                  {editedData[fieldKey] || "-"}
                </div>
              )}
              <MensajeCampo mensaje={error} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Control compacto, en rojo si tiene error (misma clase que el resto de los formularios). */
const controlProps = (error?: string) => ({
  "aria-invalid": !!error,
  className: cn(claseCampo(error), "field-input-sm"),
});

/**
 * Decide que control mostrar para un campo en edicion. Los campos con
 * dominio cerrado (sede, estado, condicion) o alimentados por un catalogo
 * administrable (sistema operativo, antivirus, licencia M365) usan un
 * select en vez de texto libre; el resto sigue como input de texto.
 */
function renderEditControl(
  fieldKey: string,
  value: string,
  handleFieldChange: (field: string, value: string) => void,
  error: string | undefined,
  sedes: Sede[]
) {
  if (fieldKey === "sede" || fieldKey === "sedeId") {
    return (
      <select
        value={value}
        onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
        {...controlProps(error)}
      >
        <option value="">Selecciona una sede...</option>
        {sedes.map((s) => (
          <option key={s.id} value={s.nombre}>
            {s.nombre}
          </option>
        ))}
        {/* Valor historico que no matchea ninguna sede activa: se deja
            visible para no perderlo de vista aunque no este en la lista. */}
        {value && !sedes.some((s) => s.nombre === value) && (
          <option value={value}>{value}</option>
        )}
      </select>
    );
  }

  if (fieldKey === "estado") {
    return (
      <select
        value={value}
        onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
        {...controlProps(error)}
      >
        <option value="">Selecciona un estado...</option>
        {(Object.entries(estadoLabels) as [EstadoActivo, string][]).map(([valor, label]) => (
          <option key={valor} value={valor}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  if (fieldKey === "condicion") {
    return (
      <select
        value={value}
        onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
        {...controlProps(error)}
      >
        <option value="">Selecciona una condición...</option>
        {(Object.entries(condicionLabels) as [CondicionActivo, string][]).map(([valor, label]) => (
          <option key={valor} value={valor}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  const catalogEndpoint = CATALOG_FIELD_ENDPOINTS[fieldKey];
  if (catalogEndpoint) {
    return (
      <CatalogSelect
        endpoint={catalogEndpoint}
        value={value}
        onChange={(nombre) => handleFieldChange(fieldKey, nombre)}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
      {...controlProps(error)}
    />
  );
}
