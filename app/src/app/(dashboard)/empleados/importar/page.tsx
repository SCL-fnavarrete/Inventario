"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Sheet = {
  name: string;
  rowCount: number;
};

type PreviewRow = {
  fila: number;
  rut: string;
  rutValido: boolean;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  correo: string;
  cargo: string;
  jefatura: string;
  ubicacion: string;
  tipoContrato: string;
};

type ImportResult = {
  success: boolean;
  message: string;
  results: {
    created: number;
    updated: number;
    errors: Array<{ row: number; rut: string; error: string }>;
  };
};

export default function ImportarEmpleadosPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setResult(null);
    setPreview([]);
    setLoading(true);

    try {
      // Obtener hojas del Excel
      const formData = new FormData();
      formData.append("file", selectedFile);

      const sheetsRes = await fetch("/api/empleados/importar/sheets", {
        method: "POST",
        body: formData,
      });

      if (!sheetsRes.ok) {
        throw new Error("Error al leer el archivo");
      }

      const sheetsData = await sheetsRes.json();
      setSheets(sheetsData.sheets);

      if (sheetsData.sheets.length > 0) {
        setSelectedSheet(sheetsData.sheets[0].name);
        await loadPreview(selectedFile, sheetsData.sheets[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function loadPreview(fileToPreview: File, sheetName: string) {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", fileToPreview);
      formData.append("sheetName", sheetName);

      const res = await fetch("/api/empleados/importar/preview", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Error al generar preview");
      }

      const data = await res.json();
      setPreview(data.preview);
      setTotalRows(data.totalRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function handleSheetChange(sheetName: string) {
    setSelectedSheet(sheetName);
    if (file) {
      await loadPreview(file, sheetName);
    }
  }

  async function handleImport() {
    if (!file) return;

    setImporting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheetName", selectedSheet);

      const res = await fetch("/api/empleados/importar", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error en la importación");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setImporting(false);
    }
  }

  function resetImport() {
    setFile(null);
    setSheets([]);
    setSelectedSheet("");
    setPreview([]);
    setTotalRows(0);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/empleados"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importar Empleados</h1>
          <p className="text-gray-600">Cargar empleados desde archivo Excel</p>
        </div>
      </div>

      {/* Success Result */}
      {result && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="text-green-500" size={32} />
            <div>
              <h2 className="text-lg font-semibold">Importación Completada</h2>
              <p className="text-gray-600">{result.message}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-green-600">
                {result.results.created}
              </p>
              <p className="text-sm text-green-700">Creados</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">
                {result.results.updated}
              </p>
              <p className="text-sm text-blue-700">Actualizados</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-red-600">
                {result.results.errors.length}
              </p>
              <p className="text-sm text-red-700">Errores</p>
            </div>
          </div>

          {result.results.errors.length > 0 && (
            <div className="mb-6">
              <h3 className="font-medium mb-2">Errores:</h3>
              <div className="max-h-40 overflow-y-auto bg-gray-50 rounded-lg p-3">
                {result.results.errors.map((err, i) => (
                  <div
                    key={i}
                    className="text-sm text-red-600 py-1 border-b last:border-b-0"
                  >
                    Fila {err.row} ({err.rut || "Sin RUT"}): {err.error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={resetImport}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Importar Otro Archivo
            </button>
            <Link
              href="/empleados"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Ver Empleados
            </Link>
          </div>
        </div>
      )}

      {/* Upload Section */}
      {!result && (
        <>
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">1. Seleccionar Archivo</h2>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
                <AlertCircle size={20} />
                {error}
              </div>
            )}

            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                file ? "border-green-400 bg-green-50" : "border-gray-300 hover:border-blue-400"
              )}
            >
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="text-green-500" size={32} />
                  <div className="text-left">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={resetImport}
                    className="ml-4 px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto text-gray-400 mb-3" size={48} />
                  <p className="text-gray-600 mb-2">
                    Arrastra un archivo Excel aquí o haz clic para seleccionar
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700"
                  >
                    Seleccionar Archivo
                  </label>
                </>
              )}
            </div>

            {/* Sheet Selection */}
            {sheets.length > 1 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Seleccionar Hoja:
                </label>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {sheets.map((sheet) => (
                    <option key={sheet.name} value={sheet.name}>
                      {sheet.name} ({sheet.rowCount} filas)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Expected Format */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium mb-2 text-gray-900">Formato esperado:</h3>
              <p className="text-sm text-gray-600 mb-2">
                El archivo debe contener las siguientes columnas (los nombres son flexibles):
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <span className="bg-red-100 text-red-800 px-2 py-1 rounded">RUT *</span>
                <span className="bg-red-100 text-red-800 px-2 py-1 rounded">Nombre *</span>
                <span className="bg-red-100 text-red-800 px-2 py-1 rounded">Apellido P *</span>
                <span className="bg-red-100 text-red-800 px-2 py-1 rounded">Correo *</span>
                <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded">Apellido M</span>
                <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded">Cargo</span>
                <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded">Jefatura</span>
                <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded">Ubicación</span>
                <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded">Tipo Contrato</span>
                <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded">Fecha Ingreso</span>
                <span className="bg-gray-200 text-gray-800 px-2 py-1 rounded">Teléfono</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">* Campos requeridos</p>
            </div>
          </div>

          {/* Preview Section */}
          {loading && (
            <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center">
              <Loader2 className="animate-spin mr-2" />
              <span>Procesando archivo...</span>
            </div>
          )}

          {preview.length > 0 && !loading && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  2. Vista Previa ({totalRows} filas en total)
                </h2>
                <span className="text-sm text-gray-500">
                  Mostrando primeras {preview.length} filas
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">Fila</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">RUT</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">Nombre</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">Apellidos</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">Correo</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">Cargo</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">Ubicación</th>
                      <th className="px-3 py-2 text-left text-gray-700 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map((row) => (
                      <tr key={row.fila} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-900">{row.fila}</td>
                        <td className="px-3 py-2 font-mono">
                          <span
                            className={
                              row.rutValido ? "text-green-600" : "text-red-600"
                            }
                          >
                            {row.rut || "-"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-900">{row.nombres || "-"}</td>
                        <td className="px-3 py-2 text-gray-900">
                          {[row.apellidoPaterno, row.apellidoMaterno].filter(Boolean).join(" ") || "-"}
                        </td>
                        <td className="px-3 py-2 text-gray-900">{row.correo || "-"}</td>
                        <td className="px-3 py-2 text-gray-900">{row.cargo || "-"}</td>
                        <td className="px-3 py-2 text-gray-900">{row.ubicacion || "-"}</td>
                        <td className="px-3 py-2">
                          {row.rutValido && row.nombres && row.apellidoPaterno && row.correo ? (
                            <CheckCircle className="text-green-500" size={18} />
                          ) : (
                            <XCircle className="text-red-500" size={18} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Import Button */}
              <div className="mt-6 flex justify-end gap-4">
                <Link
                  href="/empleados"
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </Link>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>Importando...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={20} />
                      <span>Importar {totalRows} Empleados</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
