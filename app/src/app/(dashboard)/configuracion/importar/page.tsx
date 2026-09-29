"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  X,
  ClipboardCheck,
  Download,
} from "lucide-react";
import { cn } from "@/shared/cn";
import { ErrorReviewPanel } from "@/modules/importacion/componentes/ErrorReviewPanel";
import type { ImportPreviewResult, ImportBatchResult, CorrectedRow } from "@/modules/importacion/tipos";
import { parseApiError, type FieldErrors } from "@/shared/utilidades/apiErrors";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";
import { ESTADOS_RECONOCIDOS } from "@/modules/importacion/reglasFila";
import { FILAS_POR_TANDA } from "@/modules/importacion/validarArchivo";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { useCampoSede } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { StatCard, StatGrid } from "@/shared/ui/StatCard";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/shared/ui/CampoFormulario";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";

type Category = {
  id: number;
  nombre: string;
  descripcion: string | null;
  tipoFicha: string;
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
  // Sede a la que se importan los equipos, precargada con la del navbar
  // (useCampoSede, SPEC 2.80). Vacio significa "detectar por la columna
  // Sede" del archivo. La pantalla es solo de admin (SPEC 2.116.7).
  const [sedeId, setSedeId] = useCampoSede();
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
  const [progreso, setProgreso] = useState<{ enviadas: number; total: number } | null>(null);
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
    historialAsignaciones: "Cantidad de veces que el equipo fue asignado antes (dato histórico, sin nombre de la persona). Ej: 1, 2, 1+.",
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
    // Lo que identifica al equipo: el IMEI en celulares, el N° de serie en
    // los demas (SPEC 2.112.7).
    { key: "numeroSerie", label: "N° Serie", required: true, categories: ["computador", "monitor", "periferico", "generico"] },
    { key: "imei", label: "IMEI", required: true, categories: ["celular"] },
    { key: "marca", label: "Marca", required: true, categories: ["*"] },
    { key: "modelo", label: "Modelo", required: true, categories: ["*"] },
  ];

  // Campos de empleado (opcionales - solo requeridos si el activo está asignado)
  const employeeFields = [
    { key: "rut", label: "RUT", required: false, categories: ["*"] },
    { key: "nombre", label: "Nombre", required: false, categories: ["*"] },
    { key: "apellidoP", label: "Apellido P.", required: false, categories: ["*"] },
    { key: "apellidoM", label: "Apellido M.", required: false, categories: ["*"] },
    { key: "jefatura", label: "Jefatura", required: false, categories: ["computador"] },
    { key: "supervisor", label: "Supervisor", required: false, categories: ["computador"] },
  ];

  // Las columnas que se ofrecen dependen de que campos pide la categoria
  // elegida (SPEC 2.112.7), no de su nombre.
  const fichaElegida = categories.find((c) => c.nombre.toLowerCase() === categoria)?.tipoFicha ?? "";

  // Función para verificar si un campo aplica a la categoría seleccionada
  const fieldMatchesCategory = (fieldCategories: string[], selectedCategory: string) => {
    if (!selectedCategory) return true;
    if (fieldCategories.includes("*")) return true;
    return fieldCategories.includes(selectedCategory);
  };

  const requiredFields = allRequiredFields.filter(
    (field) => fieldMatchesCategory(field.categories, fichaElegida)
  );

  // Validacion por campo, igual que en Onboarding. Las columnas del paso 2 se
  // identifican como "map.<campo>".
  const { errores, resumen, reportar, limpiar } = useErroresFormulario({
    sheetName: "Hoja del Excel",
    categoria: "Categoría",
    sedeId: "Sede",
    ...Object.fromEntries(allRequiredFields.map((f) => [`map.${f.key}`, `Columna ${f.label}`])),
  });

  // Datos del paso 1 que faltan (hoja y categoria).
  function faltanPaso1(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!sheetName) e.sheetName = "Elige la hoja del Excel";
    if (!categoria) e.categoria = "Elige la categoría";
    return e;
  }

  const employeeFieldsFiltered = employeeFields.filter(
    (field) => fieldMatchesCategory(field.categories, fichaElegida)
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
    { key: "correoPersonal", label: "Correo Personal", categories: ["computador"] },
    { key: "correoEmpresa", label: "Correo Empresa", categories: ["computador"] },
    { key: "cargo", label: "Cargo", categories: ["computador"] },
    { key: "comuna", label: "Comuna", categories: ["computador"] },
    // "equipo" (tipo: Notebook/Celular/etc.) se elimino del mapeo -- no se
    // usaba en ningun lado, el tipo de equipo ya se elige una vez para todo
    // el archivo con el selector de Categoria, no fila por fila.
    { key: "nombreEquipo", label: "Nombre Equipo", categories: ["computador"] },
    { key: "historialAsignaciones", label: "Historial de asignaciones", categories: ["computador"] },
    { key: "procesador", label: "Procesador", categories: ["computador"] },
    { key: "discoDuro", label: "Disco Duro", categories: ["computador"] },
    { key: "ram", label: "RAM", categories: ["computador"] },
    { key: "sistemaOperativo", label: "O.S.", categories: ["computador"] },
    { key: "microsoft365", label: "Microsoft 365 Empresa", categories: ["computador"] },
    { key: "mantencion", label: "Mantención", categories: ["computador"] },
    { key: "proximaMantencion", label: "Próxima Mantención", categories: ["computador"] },
    { key: "antivirus", label: "Antivirus", categories: ["computador"] },
    // Campos para Monitor
    { key: "pulgadas", label: "Pulgadas", categories: ["monitor"] },
    // Campos para Celular
    { key: "numeroSerie", label: "N° Serie", categories: ["celular"] },
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
    (field) => fieldMatchesCategory(field.categories, fichaElegida)
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
          const { message } = await parseApiError(res, "Error al leer el archivo");
          throw new Error(message);
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
    if (!file || reportar(faltanPaso1())) return;

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
    if (!file) {
      setError("Selecciona el archivo Excel");
      return null;
    }
    const faltan = faltanPaso1();
    for (const f of requiredFields) {
      if (f.required && !columnMapping[f.key]) faltan[`map.${f.key}`] = "Elige la columna del Excel";
    }
    if (reportar(faltan)) return null;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sheetName", sheetName);
    formData.append("categoria", categoria);
    formData.append("mapping", JSON.stringify(columnMapping));
    if (sedeId) formData.append("sedeId", sedeId);
    // Fija la sede con la que se valido: un cambio posterior del navbar no
    // debe hacer que la importacion use otra distinta a la de la vista previa.
    setSedeId(sedeId);
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
    limpiar(`map.${field}`);
    setColumnMapping((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleCorrectionsChange(rowIndex: number, data: Record<string, string>) {
    setCorrections((prev) => ({ ...prev, [rowIndex]: data }));
  }

  // Unico punto de escritura: junta las filas ya validas de la vista previa
  // con las corregidas en el panel de errores y las manda a /batch en tandas
  // de FILAS_POR_TANDA, para que ninguna peticion corra demasiado tiempo y el
  // usuario vea el avance. Las filas con error que no se corrigieron quedan
  // fuera. Si una tanda falla, las anteriores ya quedaron guardadas: se
  // muestra lo importado hasta ahi junto con el error.
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
    setProgreso({ enviadas: 0, total: rows.length });

    const resultados: ImportBatchResult["results"] = [];
    const mostrarResultado = () => {
      if (resultados.length === 0) return;
      const imported = resultados.filter((r) => r.status === "imported").length;
      const failed = resultados.filter((r) => r.status === "error").length;
      setBatchResult({
        success: failed === 0 && resultados.length === rows.length,
        imported,
        skipped: 0,
        failed,
        results: resultados,
      });
      setShowErrorReview(false);
    };

    try {
      for (let i = 0; i < rows.length; i += FILAS_POR_TANDA) {
        const tanda = rows.slice(i, i + FILAS_POR_TANDA);
        const res = await fetch("/api/activos/importar/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoria,
            rows: tanda,
            sedeId: sedeId || undefined,
          }),
        });

        if (!res.ok) {
          const { message, fieldErrors: fe } = await parseApiError(res, "Error al importar");
          setError(
            resultados.length > 0
              ? `${message}. Se alcanzaron a procesar ${resultados.length} de ${rows.length} filas; las demás no se enviaron.`
              : message
          );
          setFieldErrors(fe);
          mostrarResultado();
          return;
        }

        const data: ImportBatchResult = await res.json();
        resultados.push(...data.results);
        setProgreso({ enviadas: i + tanda.length, total: rows.length });
      }
      mostrarResultado();
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error al importar";
      setError(
        resultados.length > 0
          ? `${mensaje}. Se alcanzaron a procesar ${resultados.length} de ${rows.length} filas; las demás no se enviaron.`
          : mensaje
      );
      mostrarResultado();
    } finally {
      setCommitting(false);
      setProgreso(null);
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
      {/* En Configuracion (SPEC 2.116.7): la carga inicial se hace una vez y es del admin. */}
      <PageHeader
        backHref="/configuracion"
        title="Importar Activos"
        description="Carga masiva de equipos desde archivo Excel"
      />

      {/* Avance de la importacion (se envia en tandas) */}
      {progreso && (
        <div className="rounded-lg border border-line bg-surface p-4" aria-live="polite">
          <div className="mb-2 flex justify-between text-sm text-fg">
            <span>Importando activos...</span>
            <span>
              {progreso.enviadas} de {progreso.total} filas
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Avance de la importación"
            aria-valuemin={0}
            aria-valuemax={progreso.total}
            aria-valuenow={progreso.enviadas}
            className="h-2 w-full overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full bg-primary-600 transition-all"
              style={{ width: `${(progreso.enviadas / progreso.total) * 100}%` }}
            />
          </div>
        </div>
      )}

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
                  ? "Importación completada"
                  : "Importación con advertencias"}
              </h3>

              <StatGrid cols={2} className="mt-4 mb-4">
                <StatCard variant="soft" tone="success" className="bg-surface" label="Importados" value={batchResult.imported} />
                <StatCard variant="soft" tone="danger" className="bg-surface" label="Con errores" value={batchResult.failed} />
              </StatGrid>

              {batchResult.failed > 0 && (
                <div className="mt-3">
                  <p className="font-medium text-yellow-800">Errores encontrados:</p>
                  <div className="card mt-2 max-h-48 overflow-y-auto p-3">
                    {batchResult.results
                      .filter((r) => r.status === "error")
                      .slice(0, 10)
                      .map((r, i) => (
                        <div key={i} className="py-2 border-b last:border-b-0 text-sm">
                          <span className="font-medium text-fg">Fila {r.excelRow}:</span>
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
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa a proposito (ver comentario arriba)
                    window.location.href = "/activos";
                  }}
                  className="text-primary-700 hover:text-primary-900 font-medium"
                >
                  Ver activos importados →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: File Selection */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-fg mb-4">
          Paso 1: Seleccionar Archivo
        </h2>
        <div className="space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              file ? "border-green-300 bg-green-50" : "border-line-strong"
            )}
          >
            <input
              type="file"
              accept=".xlsx"
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
                    aria-label="Quitar archivo"
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
                  <Upload className="h-10 w-10 text-fg-subtle mx-auto mb-3" />
                  <p className="text-fg-muted">
                    Arrastra un archivo Excel o{" "}
                    <span className="text-primary-700 font-medium">
                      haz clic para seleccionar
                    </span>
                  </p>
                  <p className="text-sm text-fg-subtle mt-1">
                    Formato: .xlsx. Si tienes un .xls antiguo, ábrelo en Excel y guárdalo como .xlsx.
                  </p>
                </>
              )}
            </label>
          </div>

          {availableSheets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="importar-hoja" className="field-label">
                  Hoja del Excel *
                </label>
                <select
                  id="importar-hoja"
                  value={sheetName}
                  onChange={(e) => {
                    setSheetName(e.target.value);
                    limpiar("sheetName");
                  }}
                  className={claseCampo(errores.sheetName)}
                  aria-invalid={!!errores.sheetName}
                >
                  <option value="">Seleccionar hoja</option>
                  {availableSheets.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>
                <MensajeCampo mensaje={errores.sheetName} />
              </div>
              <div>
                <label htmlFor="importar-categoria" className="field-label">
                  Categoría de Activos *
                </label>
                <select
                  id="importar-categoria"
                  value={categoria}
                  onChange={(e) => {
                    setCategoria(e.target.value);
                    limpiar("categoria");
                  }}
                  disabled={loadingCategories}
                  className={cn(claseCampo(errores.categoria), "disabled:opacity-50")}
                  aria-invalid={!!errores.categoria}
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
                <MensajeCampo mensaje={errores.categoria} />
              </div>
              <div>
                <label htmlFor="importar-sede" className="field-label">
                  Sede (opcional)
                </label>
                <select
                  id="importar-sede"
                  value={sedeId}
                  onChange={(e) => {
                    setSedeId(e.target.value);
                    limpiar("sedeId");
                  }}
                  className={claseCampo(errores.sedeId)}
                  aria-invalid={!!errores.sedeId}
                >
                  <option value="">
                    Detectar automáticamente por columna Sede
                  </option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
                <MensajeCampo mensaje={errores.sedeId} />
                <p className="mt-1 text-xs text-fg-subtle">
                  {sedeId
                    ? "Todos los equipos de este archivo quedarán en esta sede. Si el archivo trae equipos de varias sedes, elige \"Detectar automáticamente por columna Sede\"."
                    : "Sin sede fija, cada fila se asigna según su columna \"Sede\" (debe coincidir con el nombre real de una sede). Las filas sin match quedarán marcadas para corregir a mano."}
                </p>
              </div>
            </div>
          )}

          {/* Visible apenas se lee el archivo: al pulsarlo marca lo que falta. */}
          {file && availableSheets.length > 0 && !preview && (
            <button
              onClick={handlePreview}
              disabled={parsing}
              className="w-full py-3 bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50 transition-colors"
            >
              {parsing ? "Procesando..." : "Detectar campos"}
            </button>
          )}
        </div>
      </div>

      {/* Step 2: Column Mapping */}
      {preview && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-fg mb-4">
            Paso 2: Mapeo de Columnas
          </h2>
          <p className="text-sm text-fg-muted mb-4">
            Relaciona las columnas del Excel con los campos del sistema. Los
            campos marcados con * son obligatorios.
          </p>

          <div className="space-y-6">
            {/* Required Fields Section */}
            <div>
              <h3 className="text-sm font-semibold text-fg mb-3">
                Campos Requeridos del Activo *
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {requiredFields.map((field) => (
                  <div key={field.key}>
                    <label className="field-label">
                      {field.label} {field.required && "*"}
                    </label>
                    <select
                      value={columnMapping[field.key] || ""}
                      onChange={(e) => handleMappingChange(field.key, e.target.value)}
                      className={cn(
                        "w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                        errores[`map.${field.key}`] ? "border-red-500 bg-red-50" : "border-line-strong"
                      )}
                      aria-invalid={!!errores[`map.${field.key}`]}
                    >
                      <option value="">No mapear</option>
                      {preview.headers.map((header, index) => (
                        <option key={`${index}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    <MensajeCampo mensaje={errores[`map.${field.key}`]} />
                    {fieldDescriptions[field.key] && (
                      <p className="mt-1 text-xs text-fg-subtle">{fieldDescriptions[field.key]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Employee Fields Section (Optional for DISPONIBLE assets) */}
            <div>
              <h3 className="text-sm font-semibold text-fg mb-1">
                Información del Empleado (Opcional)
              </h3>
              <p className="text-xs text-fg-muted mb-3">
                Solo requerido para activos asignados. Deja en blanco para activos DISPONIBLES.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employeeFieldsFiltered.map((field) => (
                  <div key={field.key}>
                    <label className="field-label">
                      {field.label}
                    </label>
                    <select
                      value={columnMapping[field.key] || ""}
                      onChange={(e) => handleMappingChange(field.key, e.target.value)}
                      className="field-input"
                    >
                      <option value="">No mapear</option>
                      {preview.headers.map((header, index) => (
                        <option key={`${index}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    {fieldDescriptions[field.key] && (
                      <p className="mt-1 text-xs text-fg-subtle">{fieldDescriptions[field.key]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Optional Fields Section */}
            <div>
              <h3 className="text-sm font-semibold text-fg mb-3">
                Campos Adicionales (Opcionales)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {optionalFields.map((field) => (
                  <div key={field.key}>
                    <label className="field-label">
                      {field.label}
                    </label>
                    <select
                      value={columnMapping[field.key] || ""}
                      onChange={(e) => handleMappingChange(field.key, e.target.value)}
                      className="field-input"
                    >
                      <option value="">No mapear</option>
                      {preview.headers.map((header, index) => (
                        <option key={`${index}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                    {fieldDescriptions[field.key] && (
                      <p className="mt-1 text-xs text-fg-subtle">{fieldDescriptions[field.key]}</p>
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
        <div className="card p-6 max-w-full">
          <h2 className="text-lg font-semibold text-fg mb-4">
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
                          className="px-4 py-3 text-left font-semibold text-fg uppercase text-xs tracking-wider whitespace-nowrap"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-surface">
                    {preview.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-surface-muted">
                        {row.map((cell, j) => (
                          <td key={j} className="px-4 py-2 text-fg whitespace-nowrap">
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
            <p className="text-sm text-fg-subtle mt-3">
              Mostrando 5 de {preview.totalRows} filas
            </p>
          )}
        </div>
      )}

      {/* Error */}
      <ResumenErrores mensaje={resumen} />
      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Actions: Paso 3 -> Validar (nada se escribe todavia) */}
      {preview && !validation && (
        <div className="flex justify-end gap-4">
          <button
            onClick={() => {
              setPreview(null);
              setColumnMapping({});
            }}
            className={buttonClasses({ variant: "outline", className: "px-6" })}
          >
            Volver
          </button>
          <button
            onClick={handleValidate}
            disabled={validating}
            className={buttonClasses({ className: "px-6" })}
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
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-fg mb-4">
            Paso 4: Confirmar Importación
          </h2>
          <StatGrid cols={2} className="mb-4">
            <StatCard variant="soft" tone="success" label="Válidas" value={validation.validCount} />
            <StatCard variant="soft" tone="danger" label="Con errores" value={validation.errorCount} />
          </StatGrid>

          {validation.errorCount > 0 && (
            <button
              onClick={() => setShowErrorReview(true)}
              className="mb-4 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-600/90 transition-colors flex items-center gap-2"
            >
              <AlertCircle size={18} />
              Revisar y corregir {validation.errorCount} registro(s) con problemas
            </button>
          )}

          <p className="text-sm text-fg-muted mb-4">
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
              className={buttonClasses({ variant: "outline", className: "px-6" })}
            >
              Volver
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={committing}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-success-hover disabled:opacity-50 transition-colors"
            >
              <Download size={20} />
              <span>{committing ? "Importando..." : "Realizar importación"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Help */}
      <div className="bg-primary-50 rounded-lg p-6">
        <h3 className="font-semibold text-primary-950 mb-2">
          Formato esperado del Excel
        </h3>
        <ul className="text-sm text-primary-900 space-y-1 list-disc list-inside">
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
            Si incluyes fecha de <strong>Mantención</strong>, el sistema creará
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
