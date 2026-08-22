"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  X,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorReviewPanel } from "@/components/import/ErrorReviewPanel";
import type { ImportRowStatus, CorrectedRow } from "@/types/import";

type TipoDevolucion = "notebook" | "celular" | "monitor" | "kit" | "otro";
type CategoriaAplicable = TipoDevolucion | "*";

type Category = {
  id: string;
  nombre: string;
  descripcion: string | null;
  requiereSerie: boolean;
  requiereImei: boolean;
  tipoDevolucion: TipoDevolucion;
};

type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  categories: CategoriaAplicable[];
};

type ImportResult = {
  success: boolean;
  imported: number;
  errors: Array<{ row: number; message: string; type?: string; data?: Record<string, string> }>;
  skipped: number;
};

type PreviewData = {
  headers: string[];
  rows: string[][];
  totalRows: number;
};

export default function ImportarActivosPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showErrorReview, setShowErrorReview] = useState(false);
  const [reimportingCorrected, setReimportingCorrected] = useState(false);

  // Cargar categorías desde la API
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch("/api/categorias");
        if (res.ok) {
          const data = await res.json();
          setCategories(data);
        }
      } catch (err) {
        console.error("Error al cargar categorías:", err);
      } finally {
        setLoadingCategories(false);
      }
    }
    fetchCategories();
  }, []);

  // Campos requeridos por categoría ("*" significa todas las categorías)
  const allRequiredFields: ImportField[] = [
    // Campos básicos de activos (siempre requeridos para todas las categorías)
    { key: "numeroSerie", label: "N° Serie", required: true, categories: ["*"] },
    { key: "marca", label: "Marca", required: true, categories: ["*"] },
    { key: "modelo", label: "Modelo", required: true, categories: ["*"] },
  ];

  // Campos de empleado (opcionales - solo requeridos si el activo está asignado)
  const employeeFields: ImportField[] = [
    { key: "rut", label: "RUT", required: false, categories: ["*"] },
    { key: "nombre", label: "Nombre", required: false, categories: ["*"] },
    { key: "apellidoP", label: "Apellido P.", required: false, categories: ["*"] },
    { key: "apellidoM", label: "Apellido M.", required: false, categories: ["*"] },
    { key: "jefatura", label: "Jefatura", required: false, categories: ["notebook"] },
    { key: "supervisor", label: "Supervisor", required: false, categories: ["notebook"] },
  ];

  // Función para verificar si un campo aplica a la categoría seleccionada
  const fieldMatchesCategory = (
    fieldCategories: CategoriaAplicable[],
    selectedTipoDevolucion: TipoDevolucion | undefined
  ) => {
    if (!selectedTipoDevolucion) return true;
    if (fieldCategories.includes("*")) return true;
    return fieldCategories.includes(selectedTipoDevolucion);
  };

  const selectedCategory = categories.find((category) => category.id === categoriaId);

  const requiredFields = allRequiredFields.filter(
    (field) => fieldMatchesCategory(field.categories, selectedCategory?.tipoDevolucion)
  );

  const employeeFieldsFiltered = employeeFields.filter(
    (field) => fieldMatchesCategory(field.categories, selectedCategory?.tipoDevolucion)
  );

  const allOptionalFields: ImportField[] = [
    // Campos comunes para todas las categorías
    { key: "estado", label: "Estado", categories: ["*"] },
    { key: "observaciones", label: "Observaciones", categories: ["*"] },
    { key: "fechaAsignacion", label: "Fecha Asignación", categories: ["*"] },
    { key: "fechaEntrega", label: "Fecha de entrega", categories: ["*"] },
    // Campos opcionales para Notebook
    { key: "correo", label: "Correo", categories: ["notebook"] },
    { key: "cargo", label: "Cargo", categories: ["notebook"] },
    { key: "comuna", label: "Comuna", categories: ["notebook"] },
    { key: "equipo", label: "Equipo", categories: ["notebook"] },
    { key: "nombreEquipo", label: "Nombre Equipo", categories: ["notebook"] },
    { key: "procesador", label: "Procesador", categories: ["notebook"] },
    { key: "discoDuro", label: "Disco Duro", categories: ["notebook"] },
    { key: "ram", label: "RAM", categories: ["notebook"] },
    { key: "sistemaOperativo", label: "O.S.", categories: ["notebook"] },
    { key: "microsoft365", label: "Microsoft 365 Empresa", categories: ["notebook"] },
    { key: "mantencion", label: "Mantencion", categories: ["notebook"] },
    { key: "proximaMantencion", label: "Proxima Mantencion", categories: ["notebook"] },
    { key: "antivirus", label: "Antivirus", categories: ["notebook"] },
    // Campos para Monitor
    { key: "pulgadas", label: "Pulgadas", categories: ["monitor"] },
    // Campos para Celular
    { key: "imei", label: "IMEI", categories: ["celular"] },
    { key: "numeroActivacion", label: "Nro Activación", categories: ["celular"] },
    { key: "numeroTelefono", label: "Nro. Telefónico", categories: ["celular"] },
    { key: "tipoPlan", label: "Tipo Plan", categories: ["celular"] },
    { key: "cargador", label: "Cargador", categories: ["celular"] },
    { key: "lugarEntrega", label: "Lugar Entrega", categories: ["celular"] },
    { key: "entrega", label: "Entrega", categories: ["celular"] },
    { key: "tipoEquipo", label: "Tipo", categories: ["celular"] },
  ];

  // Filtrar campos opcionales según la categoría seleccionada
  const optionalFields = allOptionalFields.filter(
    (field) => fieldMatchesCategory(field.categories, selectedCategory?.tipoDevolucion)
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      setFile(selectedFile);
      setError("");
      setPreview(null);
      setResult(null);
      setColumnMapping({});
      setParsing(true);

      try {
        const formData = new FormData();
        formData.append("file", selectedFile);

        const res = await fetch("/api/activos/importar/sheets", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error("Error al leer el archivo");
        }

        const data = await res.json();
        setAvailableSheets(data.sheets);
        if (data.sheets.length === 1) {
          setSheetName(data.sheets[0]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al procesar archivo");
      } finally {
        setParsing(false);
      }
    },
    []
  );

  async function handlePreview() {
    if (!file || !sheetName || !categoriaId) {
      setError("Selecciona un archivo, hoja y categoría");
      return;
    }

    setParsing(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheetName", sheetName);
      formData.append("categoriaId", categoriaId);

      const res = await fetch("/api/activos/importar/preview", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al previsualizar");
      }

      const data = await res.json();
      setPreview(data);

      // Auto-detectar mapeo de columnas
      const autoMapping: Record<string, string> = {};
      const headerLower = data.headers.map((h: string) => h.toLowerCase().trim());

      // Mapeo automático basado en nombres comunes
      const mappings: Record<string, string[]> = {
        // Campos de activo comunes
        marca: ["marca"],
        modelo: ["modelo"],
        numeroSerie: ["nº serie", "serie", "numero serie", "n serie", "no serie", "n° serie"],
        estado: ["estado"],
        fechaAsignacion: ["fecha asignacion", "fecha asig", "fecha asignado"],
        observaciones: ["obs.", "observaciones", "observacion"],
        // Campos de Notebook
        procesador: ["procesador", "cpu"],
        ram: ["ram", "memoria"],
        discoDuro: ["disco duro", "disco"],
        almacenamiento: ["almacenamiento", "ssd", "hdd"],
        sistemaOperativo: ["o.s.", "os", "sistema operativo"],
        microsoft365: ["microsoft 365", "microsoft365", "microsoft 365 empresa", "office 365", "o365"],
        fechaEntrega: ["fecha de entrega", "fecha entrega"],
        // Campos de Mantención
        mantencion: ["mantencion", "mantención", "fecha mantencion", "fecha mantención"],
        proximaMantencion: ["proxima mantencion", "próxima mantención", "proxima mantención", "próxima mantencion"],
        // Campos de Monitor
        pulgadas: ["pulgadas", "tamaño"],
        // Campos de Celular
        imei: ["imei"],
        numeroActivacion: ["nro activacion", "numero activacion", "activacion"],
        numeroTelefono: ["nro telefonico", "nro. telefonico", "telefono", "numero telefonico"],
        tipoPlan: ["tipo plan", "plan"],
        cargador: ["cargador"],
        lugarEntrega: ["lugar entrega", "lugar"],
        entrega: ["entrega"],
        tipoEquipo: ["tipo"],
        // Campos de empleado
        rut: ["rut"],
        nombre: ["nombre"],
        apellidoP: ["apellido p", "apellido paterno"],
        apellidoM: ["apellido m", "apellido materno"],
        correo: ["correo", "email", "mail"],
        cargo: ["cargo", "puesto"],
        jefatura: ["jefatura"],
        supervisor: ["supervisor"],
        comuna: ["comuna", "ciudad"],
      };

      Object.entries(mappings).forEach(([field, aliases]) => {
        const matchIndex = headerLower.findIndex((h: string) =>
          aliases.some((alias) => h.includes(alias))
        );
        if (matchIndex !== -1) {
          autoMapping[field] = data.headers[matchIndex];
        }
      });

      setColumnMapping(autoMapping);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al previsualizar");
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!file || !sheetName || !categoriaId) {
      setError("Datos incompletos");
      return;
    }

    // Validar campos requeridos
    const missingRequired = requiredFields.filter(
      (f) => f.required && !columnMapping[f.key]
    );
    if (missingRequired.length > 0) {
      setError(
        `Faltan campos requeridos: ${missingRequired.map((f) => f.label).join(", ")}`
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheetName", sheetName);
      formData.append("categoriaId", categoriaId);
      formData.append("mapping", JSON.stringify(columnMapping));

      const res = await fetch("/api/activos/importar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al importar");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setLoading(false);
    }
  }

  function handleMappingChange(field: string, value: string) {
    setColumnMapping((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  // Función para reimportar registros corregidos
  async function handleReimportCorrected(correctedRows: CorrectedRow[]) {
    if (correctedRows.length === 0) return;

    setReimportingCorrected(true);
    setError("");

    try {
      const res = await fetch("/api/activos/importar/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoriaId,
          rows: correctedRows,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al reimportar");
      }

      // Actualizar el resultado con los nuevos importados
      if (result) {
        setResult({
          ...result,
          imported: result.imported + data.imported,
          skipped: result.skipped - data.imported,
          errors: result.errors.filter(
            (err) => !correctedRows.some((row) => row.rowIndex === err.row - 2)
          ),
        });
      }

      if (data.imported === correctedRows.length) {
        setShowErrorReview(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reimportar");
    } finally {
      setReimportingCorrected(false);
    }
  }

  // Crear labels de campos para el editor de errores
  const getFieldLabels = (): Record<string, string> => {
    const labels: Record<string, string> = {};
    [...requiredFields, ...employeeFieldsFiltered, ...optionalFields].forEach((f) => {
      labels[f.key] = f.label;
    });
    // Agregar labels por header del Excel
    if (preview) {
      preview.headers.forEach((h) => {
        if (!labels[h]) labels[h] = h;
      });
    }
    return labels;
  };

  // Convertir errores del resultado a ImportRowStatus
  const getErrorRows = (): ImportRowStatus[] => {
    if (!result) return [];
    return result.errors.map((err, index) => ({
      rowIndex: err.row - 2,
      excelRow: err.row,
      status: "error" as const,
      data: err.data || {},
      errors: [
        {
          type: (err.type as "missing_required_field" | "duplicate_in_database" | "duplicate_in_file" | "missing_employee_data" | "invalid_format" | "unknown_error") || "unknown_error",
          message: err.message,
        },
      ],
      warnings: [],
    }));
  };

  return (
    <div className="space-y-6 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/activos"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importar Activos</h1>
          <p className="text-gray-600">
            Carga masiva de equipos desde archivo Excel
          </p>
        </div>
      </div>

      {/* Panel de Revision de Errores */}
      {showErrorReview && result && result.errors.length > 0 && (
        <ErrorReviewPanel
          errorRows={getErrorRows()}
          importedCount={result.imported}
          fieldLabels={getFieldLabels()}
          onReimportCorrected={handleReimportCorrected}
          onBack={() => setShowErrorReview(false)}
          isReimporting={reimportingCorrected}
        />
      )}

      {/* Result */}
      {result && !showErrorReview && (
        <div
          className={cn(
            "rounded-lg p-6",
            result.success ? "bg-green-50" : "bg-yellow-50"
          )}
        >
          <div className="flex items-start gap-4">
            {result.success ? (
              <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3
                className={cn(
                  "font-semibold",
                  result.success ? "text-green-900" : "text-yellow-900"
                )}
              >
                {result.success
                  ? "Importacion completada"
                  : "Importacion con advertencias"}
              </h3>

              {/* Resumen visual mejorado */}
              <div className="grid grid-cols-3 gap-4 mt-4 mb-4">
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                  <p className="text-xs text-gray-600">Importados</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <p className="text-2xl font-bold text-yellow-600">{result.skipped}</p>
                  <p className="text-xs text-gray-600">Omitidos</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <p className="text-2xl font-bold text-red-600">{result.errors.length}</p>
                  <p className="text-xs text-gray-600">Con errores</p>
                </div>
              </div>

              {/* Boton para revisar y corregir errores */}
              {result.errors.length > 0 && (
                <button
                  onClick={() => setShowErrorReview(true)}
                  className="mb-4 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
                >
                  <AlertCircle size={18} />
                  Revisar y corregir {result.errors.length} registro(s) con problemas
                </button>
              )}

              {result.errors.length > 0 && (
                <div className="mt-3">
                  <p className="font-medium text-yellow-800">
                    Errores encontrados:
                  </p>
                  <div className="mt-2 max-h-48 overflow-y-auto bg-white rounded-lg p-3 shadow-sm">
                    {result.errors.slice(0, 10).map((err, i) => (
                      <div key={i} className="py-2 border-b last:border-b-0 text-sm">
                        <span className="font-medium text-gray-900">Fila {err.row}:</span>
                        <span className="ml-2 text-red-700">{err.message}</span>
                      </div>
                    ))}
                    {result.errors.length > 10 && (
                      <p className="text-sm text-gray-500 mt-2">
                        ...y {result.errors.length - 10} errores mas
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-4">
                <Link
                  href="/activos"
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Ver activos importados →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: File Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Paso 1: Seleccionar Archivo
        </h2>
        <div className="space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              file ? "border-green-300 bg-green-50" : "border-gray-300"
            )}
          >
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="h-10 w-10 text-green-600" />
                  <div className="text-left">
                    <p className="font-medium text-green-900">{file.name}</p>
                    <p className="text-sm text-green-600">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      setAvailableSheets([]);
                      setPreview(null);
                      setResult(null);
                    }}
                    className="p-1 hover:bg-green-100 rounded"
                  >
                    <X className="h-5 w-5 text-green-600" />
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">
                    Arrastra un archivo Excel o{" "}
                    <span className="text-blue-600 font-medium">
                      haz clic para seleccionar
                    </span>
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Formatos soportados: .xlsx, .xls
                  </p>
                </>
              )}
            </label>
          </div>

          {availableSheets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hoja del Excel *
                </label>
                <select
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar hoja</option>
                  {availableSheets.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoría de Activos *
                </label>
                <select
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  disabled={loadingCategories}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="">
                    {loadingCategories ? "Cargando categorías..." : "Seleccionar categoría"}
                  </option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {file && sheetName && categoriaId && !preview && (
            <button
              onClick={handlePreview}
              disabled={parsing}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {parsing ? "Procesando..." : "Vista previa"}
            </button>
          )}
        </div>
      </div>

      {/* Step 2: Column Mapping */}
      {preview && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Paso 2: Mapeo de Columnas
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Relaciona las columnas del Excel con los campos del sistema. Los
            campos marcados con * son obligatorios.
          </p>

          <div className="space-y-6">
            {/* Required Fields Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Campos Requeridos del Activo *
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {requiredFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label} {field.required && "*"}
                    </label>
                    <select
                      value={columnMapping[field.key] || ""}
                      onChange={(e) => handleMappingChange(field.key, e.target.value)}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                        field.required && !columnMapping[field.key]
                          ? "border-red-300"
                          : "border-gray-300"
                      )}
                    >
                      <option value="">No mapear</option>
                      {preview.headers.map((header, index) => (
                        <option key={`${index}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Employee Fields Section (Optional for DISPONIBLE assets) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                Información del Empleado (Opcional)
              </h3>
              <p className="text-xs text-gray-600 mb-3">
                Solo requerido para activos asignados. Deja en blanco para activos DISPONIBLES.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employeeFieldsFiltered.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                    </label>
                    <select
                      value={columnMapping[field.key] || ""}
                      onChange={(e) => handleMappingChange(field.key, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">No mapear</option>
                      {preview.headers.map((header, index) => (
                        <option key={`${index}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional Fields Section */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Campos Adicionales (Opcionales)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {optionalFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                    </label>
                    <select
                      value={columnMapping[field.key] || ""}
                      onChange={(e) => handleMappingChange(field.key, e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">No mapear</option>
                      {preview.headers.map((header, index) => (
                        <option key={`${index}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Preview Data */}
      {preview && (
        <div className="bg-white rounded-lg shadow p-6 max-w-full">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Paso 3: Vista Previa de Datos ({preview.totalRows} filas)
          </h2>
          <div className="overflow-x-auto -mx-6 px-6">
            <div className="inline-block min-w-full align-middle">
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5">
                <table className="min-w-full divide-y divide-gray-300 text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      {preview.headers.map((header, index) => (
                        <th
                          key={`${index}-${header}`}
                          className="px-4 py-3 text-left font-semibold text-gray-900 uppercase text-xs tracking-wider whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {preview.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {row.map((cell, j) => (
                          <td key={j} className="px-4 py-2 text-gray-900 whitespace-nowrap">
                            {cell || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          {preview.totalRows > 5 && (
            <p className="text-sm text-gray-500 mt-3">
              Mostrando 5 de {preview.totalRows} filas
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-700 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Actions */}
      {preview && (
        <div className="flex justify-end gap-4">
          <button
            onClick={() => {
              setPreview(null);
              setColumnMapping({});
            }}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Volver
          </button>
          <button
            onClick={handleImport}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Download size={20} />
            <span>{loading ? "Importando..." : `Importar ${preview.totalRows} activos`}</span>
          </button>
        </div>
      )}

      {/* Help */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">
          Formato esperado del Excel
        </h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>
            La primera fila (o fila de encabezados) debe contener los nombres de
            las columnas
          </li>
          <li>
            Campos mínimos requeridos: <strong>Marca, Modelo, Número de Serie</strong>
          </li>
          <li>
            <strong>Activos DISPONIBLES:</strong> No requieren información de empleado (RUT, Nombre, Apellidos).
            Simplemente incluye el campo &quot;Estado&quot; con valor &quot;DISPONIBLE&quot;
          </li>
          <li>
            <strong>Activos ASIGNADOS:</strong> Si incluyes RUT, Nombre y Apellidos, el sistema automáticamente
            creará o vinculará el empleado y marcará el activo como asignado
          </li>
          <li>
            Si incluyes fecha de <strong>Mantencion</strong>, el sistema creará
            automáticamente un registro en el módulo de Mantenciones
          </li>
          <li>
            Si la fecha de mantención es pasada, se registrará como completada;
            si es futura, como pendiente
          </li>
          <li>
            Los activos con número de serie duplicado serán omitidos
          </li>
        </ul>
      </div>
    </div>
  );
}
