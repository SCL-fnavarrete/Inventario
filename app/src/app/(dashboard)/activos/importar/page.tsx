"use client";

import { useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  X,
  ClipboardCheck,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorReviewPanel } from "@/components/import/ErrorReviewPanel";
import type { ImportPreviewResult, ImportBatchResult, CorrectedRow } from "@/types/import";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { ESTADOS_RECONOCIDOS } from "@/lib/importacion/activos";

type Category = {
  id: number;
  nombre: string;
  descripcion: string | null;
  requiereSerie: boolean;
  requiereImei: boolean;
};

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
};

type PreviewData = {
  headers: string[];
  rows: string[][];
  totalRows: number;
};

export default function ImportarActivosPage() {
  const { data: session } = useSession();
  // Sede a la que se importan los equipos. El backend la exige siempre;
  // para el tecnico viene precargada con la suya (mismo patron que
  // Activos > Nuevo).
  const [sedeId, setSedeId] = useState("");
// Solo admin puede elegir la sede.
  const esAdminSede = session?.user?.role === "admin";
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [categoria, setCategoria] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  // Resultado de la vista previa CON mapeo: valida todas las filas contra
  // las mismas reglas que la escritura real (procesarFila en dryRun), pero
  // sin tocar la base. Nada se importa hasta "Realizar importación".
  const [validation, setValidation] = useState<ImportPreviewResult | null>(null);
  // Correcciones hechas en el panel de errores, por rowIndex. Se combinan
  // con las filas ya validas al confirmar; las filas con error que no se
  // corrigen quedan fuera de la importación.
  const [corrections, setCorrections] = useState<Record<number, Record<string, string>>>({});
  const [batchResult, setBatchResult] = useState<ImportBatchResult | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showErrorReview, setShowErrorReview] = useState(false);
  // Se incrementa cada vez que llega una validacion nueva (no en cada
  // correccion suelta). Se usa como `key` de ErrorReviewPanel: al cambiar,
  // React lo desmonta y remonta, limpiando su estado interno (filas
  // marcadas como corregidas, filtro) -- necesario porque "Revalidar todo
  // el Excel" no cierra el panel, y sin esto quedarian corregidas a la
  // vista filas que la nueva validacion ya no considera corregidas.
  const [validationVersion, setValidationVersion] = useState(0);

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

  useEffect(() => {
    async function fetchSedes() {
      try {
        const res = await fetch("/api/sedes?activas=true");
        if (res.ok) {
          const data = await res.json();
          setSedes(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Error al cargar sedes:", err);
      }
    }
    fetchSedes();
  }, []);

  // Precarga la sede del usuario. El "|| prev" evita pisar una eleccion
  // manual si ya eligio otra.
  useEffect(() => {
    if (session?.user?.sedeId) {
      setSedeId((prev) => prev || session.user.sedeId!);
    }
  }, [session?.user?.sedeId]);

  // Descripciones breves de cada campo del mapeo: que dato exactamente se
  // espera en esa columna, ya que el nombre del campo solo (ej: "RUT") no
  // basta para saber que columna del Excel corresponde.
  const fieldDescriptions: Record<string, string> = {
    numeroSerie: "Número de serie único del equipo (etiqueta o grabado en el equipo).",
    marca: "Fabricante del equipo (ej: Dell, HP, Lenovo).",
    modelo: "Modelo específico del equipo (ej: Inspiron 15 3501).",
    rut: "RUT del empleado asignado, con o sin puntos ni guion.",
    nombre: "Nombre(s) del empleado.",
    apellidoP: "Apellido paterno del empleado.",
    apellidoM: "Apellido materno del empleado (opcional).",
    jefatura: "Jefatura o gerencia a la que pertenece el empleado.",
    supervisor: "Nombre del supervisor directo del empleado.",
    sede: "Sede real del equipo (ej: Santiago, Concepción, Perú). Debe coincidir con el nombre o código de una sede existente.",
    // Se arma desde ESTADOS_RECONOCIDOS (misma lista que usa procesarFila
    // para validar) para que no se desincronice de la lista real.
    estado: `Estado del equipo (${ESTADOS_RECONOCIDOS.join(", ")}).`,
    condicion: "Condición física del equipo: Nuevo, Usado, Seminuevo o Dañado.",
    observaciones: "Notas adicionales sobre el equipo.",
    fechaEntrega: "Fecha en que el equipo fue entregado a la persona (dd-mm-aaaa). Se usa como fecha de asignación.",
    fechaCompra: "Fecha de compra o factura del equipo (dd-mm-aaaa).",
    correoPersonal: "Correo personal del empleado. No es obligatorio para importar; si falta, queda vacío y se puede completar después desde la ficha del empleado.",
    correoEmpresa: "Correo corporativo del empleado. Si se deja en blanco, se genera uno automáticamente.",
    cargo: "Cargo o puesto del empleado.",
    comuna: "Comuna donde se ubica el equipo (dato informativo; no determina la sede).",
    nombreEquipo: "Nombre o identificador interno asignado al equipo.",
    procesador: "Modelo del procesador (CPU).",
    discoDuro: "Capacidad y tipo de disco duro o almacenamiento.",
    ram: "Cantidad de memoria RAM.",
    sistemaOperativo: "Sistema operativo instalado en el equipo.",
    microsoft365: "Plan de Microsoft 365 asignado (ej: Premium), si tiene.",
    // Contador impreciso ("1", "2", "1+") de cuantas veces se asigno el
    // equipo antes; no crea asignaciones reales, solo queda como nota en
    // el historial del activo.
    historialAsignaciones: "Cantidad de veces que el equipo fue asignado antes (dato historico, sin nombre de la persona). Ej: 1, 2, 1+.",
    mantencion: "Fecha de la última mantención realizada (dd-mm-aaaa).",
    proximaMantencion: "Fecha programada para la próxima mantención (dd-mm-aaaa).",
    antivirus: "Antivirus instalado en el equipo.",
    pulgadas: "Tamaño de la pantalla, en pulgadas.",
    imei: "IMEI del celular.",
    numeroActivacion: "Número de activación del plan del celular.",
    numeroTelefono: "Número telefónico asociado al celular.",
    tipoPlan: "Tipo de plan contratado para el celular.",
    cargador: "Indica si se entregó cargador junto con el celular.",
    lugarEntrega: "Lugar donde se entregó el celular.",
    entrega: "Fecha o estado de entrega del celular.",
    tipoEquipo: "Tipo específico de celular.",
  };

  // Campos requeridos por categoría ("*" significa todas las categorías)
  const allRequiredFields = [
    // Campos básicos de activos (siempre requeridos para todas las categorías)
    { key: "numeroSerie", label: "N° Serie", required: true, categories: ["*"] },
    { key: "marca", label: "Marca", required: true, categories: ["*"] },
    { key: "modelo", label: "Modelo", required: true, categories: ["*"] },
  ];

  // Campos de empleado (opcionales - solo requeridos si el activo está asignado)
  const employeeFields = [
    { key: "rut", label: "RUT", required: false, categories: ["*"] },
    { key: "nombre", label: "Nombre", required: false, categories: ["*"] },
    { key: "apellidoP", label: "Apellido P.", required: false, categories: ["*"] },
    { key: "apellidoM", label: "Apellido M.", required: false, categories: ["*"] },
    { key: "jefatura", label: "Jefatura", required: false, categories: ["notebook"] },
    { key: "supervisor", label: "Supervisor", required: false, categories: ["notebook"] },
  ];

  // Función para verificar si un campo aplica a la categoría seleccionada
  const fieldMatchesCategory = (fieldCategories: string[], selectedCategory: string) => {
    if (!selectedCategory) return true;
    if (fieldCategories.includes("*")) return true;
    return fieldCategories.includes(selectedCategory);
  };

  const requiredFields = allRequiredFields.filter(
    (field) => fieldMatchesCategory(field.categories, categoria)
  );

  const employeeFieldsFiltered = employeeFields.filter(
    (field) => fieldMatchesCategory(field.categories, categoria)
  );

  const allOptionalFields = [
    // Campos comunes para todas las categorías
    // "sede" decide, fila por fila, a que sede pertenece el activo cuando
    // el admin deja la sede en blanco. Va aparte de "comuna", que es solo
    // informativo.
    { key: "sede", label: "Sede", categories: ["*"] },
    { key: "estado", label: "Estado", categories: ["*"] },
    { key: "condicion", label: "Condición (Nuevo/Usado)", categories: ["*"] },
    { key: "observaciones", label: "Observaciones", categories: ["*"] },
    { key: "fechaEntrega", label: "Fecha de entrega", categories: ["*"] },
    { key: "fechaCompra", label: "Fecha de compra", categories: ["*"] },
    // Campos opcionales para Notebook
    { key: "correoPersonal", label: "Correo Personal", categories: ["notebook"] },
    { key: "correoEmpresa", label: "Correo Empresa", categories: ["notebook"] },
    { key: "cargo", label: "Cargo", categories: ["notebook"] },
    { key: "comuna", label: "Comuna", categories: ["notebook"] },
    // "equipo" (tipo: Notebook/Celular/etc.) se elimino del mapeo -- no se
    // usaba en ningun lado, el tipo de equipo ya se elige una vez para todo
    // el archivo con el selector de Categoria, no fila por fila.
    { key: "nombreEquipo", label: "Nombre Equipo", categories: ["notebook"] },
    { key: "historialAsignaciones", label: "Historial de asignaciones", categories: ["notebook"] },
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
    (field) => fieldMatchesCategory(field.categories, categoria)
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = e.target.files?.[0];
      if (!selectedFile) return;

      setFile(selectedFile);
      setError("");
      setPreview(null);
      setValidation(null);
      setBatchResult(null);
      setCorrections({});
      setShowErrorReview(false);
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
    if (!file || !sheetName || !categoria) {
      setError("Selecciona un archivo, hoja y categoría");
      return;
    }
    if (!esAdminSede && !sedeId) {
      setError("Selecciona la sede a la que se importarán estos equipos");
      return;
    }

    setParsing(true);
    setError("");
    setFieldErrors({});

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheetName", sheetName);
      formData.append("categoria", categoria);

      const res = await fetch("/api/activos/importar/preview", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al previsualizar");
        setError(message);
        setFieldErrors(fe);
        return;
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
        condicion: ["condicion", "condición"],
        fechaCompra: ["fecha compra", "fecha de compra", "fecha factura"],
        observaciones: ["obs.", "observaciones", "observacion"],
        // Campos de Notebook
        procesador: ["procesador", "cpu"],
        ram: ["ram", "memoria"],
        discoDuro: ["disco duro", "disco"],
        almacenamiento: ["almacenamiento", "ssd", "hdd"],
        sistemaOperativo: ["o.s.", "os", "sistema operativo"],
        antivirus: ["antivirus", "anti-virus", "antivirus instalado"],
        microsoft365: ["microsoft 365", "microsoft365", "microsoft 365 empresa", "office 365", "o365"],
        fechaEntrega: ["fecha de entrega", "fecha entrega"],
        // Campos de Mantención
        historialAsignaciones: ["historial de asignaciones", "historial de asignaciónes", "historial asignaciones"],
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
        correoEmpresa: ["correo empresa", "correo de la empresa", "correo corporativo", "mail empresa"],
        correoPersonal: ["correo personal", "mail personal", "correo", "email", "mail"],
        cargo: ["cargo", "puesto"],
        jefatura: ["jefatura"],
        supervisor: ["supervisor"],
        comuna: ["comuna", "ciudad"],
        sede: ["sede"],
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

  // Corre la validacion completa (dryRun) contra las mismas reglas de
  // negocio que la escritura real -- ver procesarFila.ts. No se escribe
  // nada en la base todavia: eso ocurre recien en handleConfirmImport,
  // cuando el usuario aprieta "Realizar importación".
  // Nucleo compartido entre "Validar" (paso inicial) y "Revalidar todo el
  // Excel" (desde el panel de errores): corre exactamente la misma
  // vista previa. null significa que ya se seteo error/fieldErrors y quien
  // llamo no debe hacer nada mas.
  async function ejecutarValidacion(): Promise<ImportPreviewResult | null> {
    if (!file || !sheetName || !categoria) {
      setError("Datos incompletos");
      return null;
    }
    if (!esAdminSede && !sedeId) {
      setError("Selecciona la sede a la que se importarán estos equipos");
      return null;
    }

    const missingRequired = requiredFields.filter(
      (f) => f.required && !columnMapping[f.key]
    );
    if (missingRequired.length > 0) {
      setError(
        `Faltan campos requeridos: ${missingRequired.map((f) => f.label).join(", ")}`
      );
      return null;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sheetName", sheetName);
    formData.append("categoria", categoria);
    formData.append("mapping", JSON.stringify(columnMapping));
    if (sedeId) formData.append("sedeId", sedeId);
    // Correcciones ya hechas a mano en el panel de errores (ver
    // handleRevalidateAll) -- sin esto, revalidar el Excel completo
    // pisaba cualquier arreglo manual con el dato crudo del archivo de
    // nuevo, como si nunca se hubiera corregido.
    if (Object.keys(corrections).length > 0) {
      formData.append("corrections", JSON.stringify(corrections));
    }

    const res = await fetch("/api/activos/importar/preview", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const { message, fieldErrors: fe } = await parseApiError(res, "Error al validar los datos");
      setError(message);
      setFieldErrors(fe);
      return null;
    }

    return (await res.json()) as ImportPreviewResult;
  }

  async function handleValidate() {
    setValidating(true);
    setError("");
    setFieldErrors({});
    setBatchResult(null);
    setCorrections({});
    setShowErrorReview(false);

    try {
      const data = await ejecutarValidacion();
      if (data) {
        setValidation(data);
        setValidationVersion((v) => v + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al validar los datos");
    } finally {
      setValidating(false);
    }
  }

  // Boton "Revalidar todo el Excel" del panel de errores: a diferencia de
  // handleValidate, NO oculta el panel mientras corre ni de entrada -- la
  // idea es que, tras corregir algo (ej. crear una opcion de catalogo que
  // faltaba), apretar este boton muestre el resultado en el mismo lugar
  // donde estaban los errores, sin tener que cerrar y volver a abrir la
  // revision. Si ya no queda ningun error, recien ahi se cierra el panel
  // solo, porque no hay nada mas que revisar.
  async function handleRevalidateAll() {
    setValidating(true);
    setError("");
    setFieldErrors({});

    try {
      // ejecutarValidacion() lee `corrections` (las manda al servidor para
      // que las use en vez del dato crudo del Excel -- ver comentario
      // ahi mismo), asi que recien se limpia DESPUES de tener una
      // respuesta exitosa: si la revalidacion falla (ej. sin conexion),
      // las correcciones hechas a mano no se pierden.
      const data = await ejecutarValidacion();
      if (data) {
        setValidation(data);
        setValidationVersion((v) => v + 1);
        setShowErrorReview(data.errorCount > 0);
        setCorrections({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al validar los datos");
    } finally {
      setValidating(false);
    }
  }

  function handleMappingChange(field: string, value: string) {
    setColumnMapping((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleCorrectionsChange(rowIndex: number, data: Record<string, string>) {
    setCorrections((prev) => ({ ...prev, [rowIndex]: data }));
  }

  // Unico punto de escritura: junta las filas ya validas de la vista previa
  // con las corregidas en el panel de errores y las manda TODAS de una vez
  // a /batch. Las filas con error que no se corrigieron quedan fuera.
  async function handleConfirmImport() {
    if (!validation) return;

    const rows: CorrectedRow[] = validation.rows
      .map((row) => {
        if (row.status === "valid") return { rowIndex: row.rowIndex, data: row.data };
        const corregida = corrections[row.rowIndex];
        return corregida ? { rowIndex: row.rowIndex, data: corregida } : null;
      })
      .filter((r): r is CorrectedRow => r !== null);

    if (rows.length === 0) {
      setError("No hay filas válidas ni corregidas para importar");
      return;
    }

    setCommitting(true);
    setError("");
    setFieldErrors({});

    try {
      const res = await fetch("/api/activos/importar/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria,
          rows,
          sedeId: sedeId || undefined,
        }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al importar");
        setError(message);
        setFieldErrors(fe);
        return;
      }

      const data: ImportBatchResult = await res.json();
      setBatchResult(data);
      setShowErrorReview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar");
    } finally {
      setCommitting(false);
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

  const errorRows = validation ? validation.rows.filter((r) => r.status === "error") : [];
  const pendingErrorCount = errorRows.length - Object.keys(corrections).length;

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

      {/* Panel de Revision de Errores (solo corrige, no escribe nada) */}
      {showErrorReview && validation && errorRows.length > 0 && (
        <ErrorReviewPanel
          key={validationVersion}
          errorRows={errorRows}
          validCount={validation.validCount}
          fieldLabels={getFieldLabels()}
          onCorrectionsChange={handleCorrectionsChange}
          onBack={() => setShowErrorReview(false)}
          onConfirmImport={handleConfirmImport}
          committing={committing}
          onRevalidateAll={handleRevalidateAll}
          revalidating={validating}
        />
      )}

      {/* Resultado final de la importación */}
      {batchResult && !showErrorReview && (
        <div
          className={cn(
            "rounded-lg p-6",
            batchResult.success ? "bg-green-50" : "bg-yellow-50"
          )}
        >
          <div className="flex items-start gap-4">
            {batchResult.success ? (
              <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-6 w-6 text-yellow-600 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h3
                className={cn(
                  "font-semibold",
                  batchResult.success ? "text-green-900" : "text-yellow-900"
                )}
              >
                {batchResult.success
                  ? "Importacion completada"
                  : "Importacion con advertencias"}
              </h3>

              <div className="grid grid-cols-2 gap-4 mt-4 mb-4">
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <p className="text-2xl font-bold text-green-600">{batchResult.imported}</p>
                  <p className="text-xs text-gray-600">Importados</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                  <p className="text-2xl font-bold text-red-600">{batchResult.failed}</p>
                  <p className="text-xs text-gray-600">Con errores</p>
                </div>
              </div>

              {batchResult.failed > 0 && (
                <div className="mt-3">
                  <p className="font-medium text-yellow-800">Errores encontrados:</p>
                  <div className="mt-2 max-h-48 overflow-y-auto bg-white rounded-lg p-3 shadow-sm">
                    {batchResult.results
                      .filter((r) => r.status === "error")
                      .slice(0, 10)
                      .map((r, i) => (
                        <div key={i} className="py-2 border-b last:border-b-0 text-sm">
                          <span className="font-medium text-gray-900">Fila {r.excelRow}:</span>
                          <span className="ml-2 text-red-700">
                            {r.errors[0]?.message}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-4">
                {/* Boton, no <Link>: una navegacion normal reutiliza la
                    instancia ya montada de /activos (Router Cache) y no
                    vuelve a pedir los datos recien importados. Se fuerza
                    una recarga completa por JS en vez de un <a>, para no
                    disparar la regla de ESLint que asume que todo <a>
                    interno deberia ser <Link>. */}
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = "/activos";
                  }}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  Ver activos importados →
                </button>
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
                      setValidation(null);
                      setBatchResult(null);
                      setCorrections({});
                      setShowErrorReview(false);
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
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  disabled={loadingCategories}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="">
                    {loadingCategories ? "Cargando categorías..." : "Seleccionar categoría"}
                  </option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.nombre.toLowerCase()}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sede {esAdminSede ? "(opcional)" : "*"}
                </label>
                <select
                  value={sedeId}
                  onChange={(e) => setSedeId(e.target.value)}
                  disabled={!esAdminSede}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {esAdminSede ? "Detectar automáticamente por columna Sede" : "Seleccionar sede"}
                  </option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  {esAdminSede
                    ? sedeId
                      ? "Todos los equipos de este archivo quedarán en esta sede, sea quien sea que haga la importación."
                      : "Sin sede fija, cada fila se asigna según su columna \"Sede\" (debe coincidir con el nombre real de una sede). Las filas sin match quedarán marcadas para corregir a mano."
                    : "Es tu sede: los equipos de este archivo quedarán en ella. Si una fila declara otra sede, no se importa."}
                </p>
              </div>
            </div>
          )}

          {file && sheetName && categoria && !preview && (
            <button
              onClick={handlePreview}
              disabled={parsing || (!esAdminSede && !sedeId)}
              title={!esAdminSede && !sedeId ? "Primero elige la sede de destino" : undefined}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {parsing ? "Procesando..." : "Detectar campos"}
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
                    {fieldDescriptions[field.key] && (
                      <p className="mt-1 text-xs text-gray-500">{fieldDescriptions[field.key]}</p>
                    )}
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
                    {fieldDescriptions[field.key] && (
                      <p className="mt-1 text-xs text-gray-500">{fieldDescriptions[field.key]}</p>
                    )}
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
                    {fieldDescriptions[field.key] && (
                      <p className="mt-1 text-xs text-gray-500">{fieldDescriptions[field.key]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Preview Data */}
      {preview && !validation && (
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
      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Actions: Paso 3 -> Validar (nada se escribe todavia) */}
      {preview && !validation && (
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
            onClick={handleValidate}
            disabled={validating || (!esAdminSede && !sedeId)}
            title={!esAdminSede && !sedeId ? "Primero elige la sede de destino" : undefined}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <ClipboardCheck size={20} />
            <span>{validating ? "Validando..." : `Validar ${preview.totalRows} filas`}</span>
          </button>
        </div>
      )}

      {/* Step 4: Validacion -- resumen + boton de confirmacion. Nada se
          escribe hasta este punto: "Realizar importación" es el unico
          gesto que confirma. */}
      {validation && !showErrorReview && !batchResult && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Paso 4: Confirmar Importación
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{validation.validCount}</p>
              <p className="text-sm text-green-700">Válidas</p>
            </div>
            <div className="bg-red-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{validation.errorCount}</p>
              <p className="text-sm text-red-700">Con errores</p>
            </div>
          </div>

          {validation.errorCount > 0 && (
            <button
              onClick={() => setShowErrorReview(true)}
              className="mb-4 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
            >
              <AlertCircle size={18} />
              Revisar y corregir {validation.errorCount} registro(s) con problemas
            </button>
          )}

          <p className="text-sm text-gray-600 mb-4">
            {validation.errorCount === 0
              ? `Todas las ${validation.validCount} filas son válidas y se importarán al confirmar.`
              : `Se importarán las ${validation.validCount} fila(s) válida(s)${
                  pendingErrorCount > 0
                    ? ` y las que corrijas (quedan ${pendingErrorCount} sin corregir, que no se importarán).`
                    : " y todas las que ya corregiste."
                }`}
          </p>

          <div className="flex justify-end gap-4">
            <button
              onClick={() => {
                setValidation(null);
                setCorrections({});
              }}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Volver
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={committing}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Download size={20} />
              <span>{committing ? "Importando..." : "Realizar importación"}</span>
            </button>
          </div>
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
          <li>
            Nada se guarda en el sistema hasta que apruebes la validación y presiones
            <strong> &quot;Realizar importación&quot;</strong>
          </li>
        </ul>
      </div>
    </div>
  );
}
