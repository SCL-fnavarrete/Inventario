"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle, ClipboardCheck, Download, Search } from "lucide-react";
import { cn } from "@/shared/cn";
import { ErrorReviewPanel } from "@/modules/importacion/componentes/ErrorReviewPanel";
import { AvanceImportacion, BloquePaso, CargaArchivo, MapeoColumnas, Pasos, type GrupoMapeo } from "@/modules/importacion/componentes/asistente/piezas";
import { MarcasNuevas } from "@/modules/importacion/componentes/asistente/MarcasNuevas";
import { ResumenFallos } from "@/modules/importacion/componentes/asistente/ResumenFallos";
import {
  FILAS_POR_TANDA,
  camposDeFicha,
  marcasNuevasDeFallos,
  esObligatorio,
  mapeoSugerido,
  type CorrectedRow,
  type Fallo,
  type ImportBatchResult,
  type ImportPreviewResult,
} from "@/modules/importacion";
import { parseApiError, type FieldErrors, mensajeDeError } from "@/shared/utilidades/apiErrors";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";
import { Button } from "@/shared/ui/Button";
import { CampoFormulario, ResumenErrores, claseInput } from "@/shared/ui/CampoFormulario";
import { StatCard, StatGrid } from "@/shared/ui/StatCard";
import { useCampoSede } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";

/**
 * Importacion de equipos dentro del asistente de Importacion de datos (SPEC
 * 2.133): 1) archivo, hoja y sede; 2) columnas; 3) revision (todas las filas se
 * validan con las mismas reglas que la escritura real, sin guardar nada: por que
 * fallan, que personas se crean y la correccion fila por fila); 4) guardar en
 * tandas, con el avance y el resultado. La categoria se elige antes, en el
 * selector del asistente; la ficha de esa categoria decide que columnas se
 * ofrecen.
 */

type Sede = { id: string; codigo: string; nombre: string };
type PreviewData = { headers: string[]; rows: string[][]; totalRows: number };

const GRUPOS: Record<"equipo" | "persona" | "extra", { titulo: string; descripcion: string }> = {
  equipo: { titulo: "Lo que identifica al equipo", descripcion: "Los campos con * son obligatorios." },
  persona: {
    titulo: "La persona que tiene el equipo (opcional)",
    descripcion: "Si la fila trae persona, se busca por RUT (o por nombre); si no existe, se crea. Déjalo sin columnas para equipos sin persona a cargo.",
  },
  extra: { titulo: "Datos adicionales (opcionales)", descripcion: "Estado, condición, fechas, sede y los datos propios de esta categoría." },
};

export function FlujoEquipos({ categoria, ficha, nombreCategoria }: { categoria: string; ficha: string; nombreCategoria: string }) {
  // Sede a la que se importan los equipos, precargada con la del navbar (SPEC 2.80).
  // Vacio significa "detectar por la columna Sede" del archivo.
  const [sedeId, setSedeId] = useCampoSede();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [progreso, setProgreso] = useState<{ enviadas: number; total: number } | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  // Resultado de la revision CON mapeo: valida todas las filas contra las mismas
  // reglas que la escritura real (procesarFila en dryRun), sin tocar la base.
  const [validation, setValidation] = useState<ImportPreviewResult | null>(null);
  // Correcciones hechas en el panel de errores, por rowIndex. Se combinan con las
  // filas ya validas al confirmar; las filas con error que no se corrigen quedan fuera.
  const [corrections, setCorrections] = useState<Record<number, Record<string, string>>>({});
  const [batchResult, setBatchResult] = useState<ImportBatchResult | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [showErrorReview, setShowErrorReview] = useState(false);
  // Cambia con cada validacion nueva (no con cada correccion): es la `key` del panel de
  // errores, para que al revalidar se limpie su estado interno.
  const [validationVersion, setValidationVersion] = useState(0);

  const campos = camposDeFicha(ficha);
  const paso = batchResult || committing ? 4 : validation ? 3 : preview ? 2 : 1;

  useEffect(() => {
    fetch("/api/sedes?activas=true")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSedes(Array.isArray(data) ? data : []))
      .catch(() => setSedes([]));
  }, []);

  // Validacion por campo, igual que en Onboarding. Las columnas del paso 2 se identifican como "map.<campo>".
  const { errores, resumen, reportar, limpiar } = useErroresFormulario({
    sheetName: "Hoja del Excel",
    sedeId: "Sede",
    ...Object.fromEntries(campos.map((c) => [`map.${c.key}`, `Columna ${c.etiqueta}`])),
  });

  const reiniciar = () => {
    setError("");
    setFieldErrors({});
    setPreview(null);
    setValidation(null);
    setBatchResult(null);
    setCorrections({});
    setShowErrorReview(false);
    setColumnMapping({});
  };

  const handleFileChange = useCallback(async (selectedFile: File) => {
    setFile(selectedFile);
    reiniciar();
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await fetch("/api/activos/importar/sheets", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await parseApiError(res, "Error al leer el archivo")).message);
      const data = await res.json();
      setAvailableSheets(data.sheets);
      setSheetName(data.sheets.length === 1 ? data.sheets[0] : "");
    } catch (err) {
      setError(mensajeDeError(err, "Error al procesar archivo"));
    } finally {
      setParsing(false);
    }
  }, []);

  const quitarArchivo = () => {
    setFile(null);
    setAvailableSheets([]);
    setSheetName("");
    reiniciar();
  };

  async function handlePreview() {
    if (!file) return;
    if (reportar(sheetName ? {} : { sheetName: "Elige la hoja del Excel" })) return;
    setParsing(true);
    setError("");
    setFieldErrors({});
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("sheetName", sheetName);
      formData.append("categoria", categoria);
      const res = await fetch("/api/activos/importar/preview", { method: "POST", body: formData });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al leer la hoja");
        setError(message);
        setFieldErrors(fe);
        return;
      }
      const data: PreviewData = await res.json();
      setPreview(data);
      setColumnMapping(mapeoSugerido(data.headers, campos));
    } catch (err) {
      setError(mensajeDeError(err, "Error al leer la hoja"));
    } finally {
      setParsing(false);
    }
  }

  // Corre la validacion completa (dryRun) contra las mismas reglas de negocio que la
  // escritura real (procesarFila.ts). No escribe nada: eso ocurre recien en
  // handleConfirmImport. null significa que ya se mostro el error.
  async function ejecutarValidacion(): Promise<ImportPreviewResult | null> {
    if (!file) {
      setError("Selecciona el archivo Excel");
      return null;
    }
    const faltan: Record<string, string> = {};
    if (!sheetName) faltan.sheetName = "Elige la hoja del Excel";
    for (const c of campos) if (esObligatorio(c, ficha) && !columnMapping[c.key]) faltan[`map.${c.key}`] = "Elige la columna del Excel";
    if (reportar(faltan)) return null;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sheetName", sheetName);
    formData.append("categoria", categoria);
    formData.append("mapping", JSON.stringify(columnMapping));
    if (sedeId) formData.append("sedeId", sedeId);
    // Fija la sede con la que se valido: un cambio posterior del navbar no debe usar otra distinta.
    setSedeId(sedeId);
    // Correcciones ya hechas a mano en el panel de errores: sin esto, revalidar pisaba cualquier arreglo manual.
    if (Object.keys(corrections).length > 0) formData.append("corrections", JSON.stringify(corrections));

    const res = await fetch("/api/activos/importar/preview", { method: "POST", body: formData });
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
      setError(mensajeDeError(err, "Error al validar los datos"));
    } finally {
      setValidating(false);
    }
  }

  // "Revalidar todo el Excel" del panel de errores: no oculta el panel mientras corre, para ver
  // el resultado donde estaban los errores. Si ya no queda ninguno, el panel se cierra solo.
  async function handleRevalidateAll() {
    setValidating(true);
    setError("");
    setFieldErrors({});
    try {
      // Las correcciones se limpian DESPUES de una respuesta exitosa: si falla (sin conexion), no se pierden.
      const data = await ejecutarValidacion();
      if (data) {
        setValidation(data);
        setValidationVersion((v) => v + 1);
        setShowErrorReview(data.errorCount > 0);
        setCorrections({});
      }
    } catch (err) {
      setError(mensajeDeError(err, "Error al validar los datos"));
    } finally {
      setValidating(false);
    }
  }

  // Unico punto de escritura: junta las filas validas con las corregidas y las manda a /batch en
  // tandas de FILAS_POR_TANDA (el usuario ve el avance). Las filas con error sin corregir quedan
  // fuera. Si una tanda falla, las anteriores ya quedaron guardadas: se muestra lo importado y el error.
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
      const failed = resultados.filter((r) => r.status === "error").length;
      setBatchResult({ success: failed === 0 && resultados.length === rows.length, imported: resultados.filter((r) => r.status === "imported").length, skipped: 0, failed, results: resultados });
      setShowErrorReview(false);
    };
    const avisoParcial = (mensaje: string) => (resultados.length > 0 ? `${mensaje}. Se alcanzaron a procesar ${resultados.length} de ${rows.length} filas; las demás no se enviaron.` : mensaje);

    try {
      for (let i = 0; i < rows.length; i += FILAS_POR_TANDA) {
        const tanda = rows.slice(i, i + FILAS_POR_TANDA);
        const res = await fetch("/api/activos/importar/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoria, rows: tanda, sedeId: sedeId || undefined }),
        });
        if (!res.ok) {
          const { message, fieldErrors: fe } = await parseApiError(res, "Error al importar");
          setError(avisoParcial(message));
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
      setError(avisoParcial(mensajeDeError(err, "Error al importar")));
      mostrarResultado();
    } finally {
      setCommitting(false);
      setProgreso(null);
    }
  }

  // Nombres legibles de los campos para el editor de errores.
  const getFieldLabels = (): Record<string, string> => {
    const labels: Record<string, string> = {};
    campos.forEach((c) => (labels[c.key] = c.etiqueta));
    preview?.headers.forEach((h) => {
      if (!labels[h]) labels[h] = h;
    });
    return labels;
  };

  const grupos: GrupoMapeo[] = (["equipo", "persona", "extra"] as const).map((g) => ({
    ...GRUPOS[g],
    campos: campos.filter((c) => c.grupo === g).map((c) => ({ key: c.key, etiqueta: c.etiqueta, obligatorio: esObligatorio(c, ficha), ayuda: c.descripcion })),
  }));

  const errorRows = validation ? validation.rows.filter((r) => r.status === "error") : [];
  const pendingErrorCount = errorRows.length - Object.keys(corrections).length;
  // Por que fallan las filas (revision) y por que fallo al guardar (resultado), con la serie o el IMEI para encontrarlas.
  const referencia = (d: Record<string, string>) => d.imei || d.numeroSerie || undefined;
  const fallosRevision: Fallo[] = errorRows.map((r) => ({ fila: r.excelRow, mensaje: r.errors[0]?.message ?? "Error en la fila", referencia: referencia(r.data) }));
  const fallosGuardado: Fallo[] = (batchResult?.results ?? []).filter((r) => r.status === "error").map((r) => ({ fila: r.excelRow, mensaje: r.errors[0]?.message ?? "Error en la fila", referencia: referencia(r.data) }));

  return (
    <div className="max-w-full space-y-6">
      <Pasos actual={paso} />

      {progreso && <AvanceImportacion hechas={progreso.enviadas} total={progreso.total} texto="Importando equipos..." />}

      {/* Panel de revision de errores (solo corrige, no escribe nada) */}
      {showErrorReview && validation && errorRows.length > 0 && (
        <ErrorReviewPanel
          key={validationVersion}
          errorRows={errorRows}
          validCount={validation.validCount}
          fieldLabels={getFieldLabels()}
          onCorrectionsChange={(rowIndex, data) => setCorrections((prev) => ({ ...prev, [rowIndex]: data }))}
          onBack={() => setShowErrorReview(false)}
          onConfirmImport={handleConfirmImport}
          committing={committing}
          onRevalidateAll={handleRevalidateAll}
          revalidating={validating}
        />
      )}

      {/* Resultado final */}
      {batchResult && !showErrorReview && (
        <div className={cn("rounded-lg border p-6", batchResult.success ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/20" : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20")}>
          <div className="flex items-start gap-4">
            {batchResult.success ? <CheckCircle className="h-6 w-6 shrink-0 text-green-600" aria-hidden="true" /> : <AlertCircle className="h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />}
            <div className="flex-1 space-y-4">
              <h3 className="font-semibold text-fg">{batchResult.success ? "Importación completada" : "Importación con filas que fallaron"}</h3>
              <StatGrid cols={2}>
                <StatCard variant="soft" tone="success" className="bg-surface" label="Importados" value={batchResult.imported} />
                <StatCard variant="soft" tone="danger" className="bg-surface" label="Con errores" value={batchResult.failed} />
              </StatGrid>

              {(() => {
                const nuevas = batchResult.results.filter((r) => r.persona?.accion === "nueva");
                const completadas = batchResult.results.filter((r) => (r.persona?.completados.length ?? 0) > 0);
                if (nuevas.length + completadas.length === 0) return null;
                return (
                  <p className="text-sm text-fg-muted">
                    Personas: {nuevas.filter((r) => r.persona?.estado === "activo").length} creada(s) activa(s),{" "}
                    {nuevas.filter((r) => r.persona?.estado === "desvinculado").length} creada(s) desvinculada(s)
                    {completadas.length > 0 && ` y ${completadas.length} con datos completados`}. Completa el correo y el cargo de las nuevas en Personal.
                  </p>
                );
              })()}

              <ResumenFallos fallos={fallosGuardado} titulo="Filas que no se pudieron guardar" archivo={`errores-${categoria}`} />

              {/* Boton, no <Link>: una navegacion normal reutiliza /activos ya montada (Router Cache) y no
                  vuelve a pedir los datos recien importados; se fuerza una recarga completa. */}
              <button
                type="button"
                onClick={() => {
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa a proposito (ver comentario arriba)
                  window.location.href = "/activos";
                }}
                className="font-medium text-primary-700 hover:text-primary-900 dark:text-primary-300"
              >
                Ver activos importados →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paso 1: archivo */}
      {!validation && !preview && (
        <BloquePaso>
          <CargaArchivo archivo={file} onElegir={handleFileChange} onQuitar={quitarArchivo} deshabilitado={parsing} />

          {availableSheets.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CampoFormulario label="Hoja del Excel" obligatorio htmlFor="importar-hoja" error={errores.sheetName}>
                <select
                  id="importar-hoja"
                  value={sheetName}
                  onChange={(e) => {
                    setSheetName(e.target.value);
                    limpiar("sheetName");
                  }}
                  className={claseInput(errores.sheetName)}
                >
                  <option value="">Seleccionar hoja</option>
                  {availableSheets.map((sheet) => (
                    <option key={sheet} value={sheet}>
                      {sheet}
                    </option>
                  ))}
                </select>
              </CampoFormulario>
              <CampoFormulario
                label="Sede (opcional)"
                htmlFor="importar-sede"
                error={errores.sedeId}
                ayuda={
                  sedeId
                    ? "Todos los equipos de este archivo quedarán en esta sede."
                    : 'Sin sede fija, cada fila va a la sede de su columna "Sede" (debe coincidir con el nombre de una sede). Si la columna viene vacía, el equipo queda sin sede y se completa después en Editar; si trae una sede que no existe, la fila queda para corregir.'
                }
              >
                <select
                  id="importar-sede"
                  value={sedeId}
                  onChange={(e) => {
                    setSedeId(e.target.value);
                    limpiar("sedeId");
                  }}
                  className={claseInput(errores.sedeId)}
                >
                  <option value="">Detectar por la columna Sede</option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
              </CampoFormulario>
            </div>
          )}

          {file && availableSheets.length > 0 && (
            <div className="flex justify-end">
              <Button onClick={handlePreview} loading={parsing} leftIcon={<Search size={18} />}>
                Detectar columnas
              </Button>
            </div>
          )}
        </BloquePaso>
      )}

      {/* Paso 2: columnas */}
      {preview && !validation && (
        <>
          <BloquePaso titulo="Columnas del Excel">
            <p className="text-sm text-fg-muted">
              La hoja &quot;{sheetName}&quot; tiene {preview.totalRows} filas. Se propuso qué columna es cada dato según su nombre; revísalo y corrige lo que haga falta. {nombreCategoria}:
              los campos con * son obligatorios.
            </p>
            <MapeoColumnas
              grupos={grupos}
              encabezados={preview.headers}
              mapeo={columnMapping}
              onCambio={(campo, columna) => {
                limpiar(`map.${campo}`);
                setColumnMapping((prev) => ({ ...prev, [campo]: columna }));
              }}
              errores={errores}
              ejemplo={(columna) => {
                const i = preview.headers.indexOf(columna);
                return preview.rows.map((r) => r[i]).find(Boolean) || undefined;
              }}
            />
          </BloquePaso>

          <BloquePaso titulo={`Así se ve el archivo (${Math.min(5, preview.totalRows)} de ${preview.totalRows} filas)`}>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="min-w-full divide-y divide-line text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    {preview.headers.map((header, index) => (
                      <th key={`${index}-${header}`} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="whitespace-nowrap px-4 py-2 text-fg">
                          {cell || "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </BloquePaso>

          <ResumenErrores mensaje={resumen} />
          <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              leftIcon={<ArrowLeft size={18} />}
              onClick={() => {
                setPreview(null);
                setColumnMapping({});
              }}
            >
              Volver
            </Button>
            <Button onClick={handleValidate} loading={validating} leftIcon={<ClipboardCheck size={18} />}>
              Revisar {preview.totalRows} filas
            </Button>
          </div>
        </>
      )}

      {!preview && !validation && (
        <>
          <ResumenErrores mensaje={resumen} />
          <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />
        </>
      )}

      {/* Paso 3: revision. Nada se escribe hasta "Importar". */}
      {validation && !showErrorReview && !batchResult && (
        <BloquePaso titulo="Revisión">
          <StatGrid cols={2}>
            <StatCard variant="soft" tone="success" label="Se importarán" value={validation.validCount} />
            <StatCard variant="soft" tone="danger" label="Con errores" value={validation.errorCount} />
          </StatGrid>

          {validation.personas && validation.personas.nuevasActivas + validation.personas.nuevasDesvinculadas + validation.personas.existentes > 0 && (
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">Personas de las filas:</span> {validation.personas.nuevasActivas} nueva(s) activa(s), {validation.personas.nuevasDesvinculadas} nueva(s)
              desvinculada(s) y {validation.personas.existentes} que ya están en el sistema
              {validation.personas.porNombre > 0 && ` (${validation.personas.porNombre} encontrada(s) por nombre, porque la fila no trae RUT)`}. Las que ya existen no cambian de estado.
            </p>
          )}

          {validation.disponiblesConPersona > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <span className="font-medium">{validation.disponiblesConPersona} equipo{validation.disponiblesConPersona === 1 ? "" : "s"} entrará{validation.disponiblesConPersona === 1 ? "" : "n"} como Asignado{validation.disponiblesConPersona === 1 ? "" : "s"}</span>: el Excel dice &quot;Disponible&quot;, pero la fila trae a una persona, así que se le entrega. Si ya no lo tiene, quita sus datos del Excel.
            </p>
          )}

          {validation.activosSinPersona > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <span className="font-medium">{validation.activosSinPersona} equipo{validation.activosSinPersona === 1 ? "" : "s"} entrará{validation.activosSinPersona === 1 ? "" : "n"} como Disponible{validation.activosSinPersona === 1 ? "" : "s"}</span>: el Excel dice &quot;Activo&quot; o &quot;Asignado&quot;, pero la fila no trae persona (RUT ni nombre), así que nadie lo tiene. Si sí lo tiene alguien, agrega su RUT en el Excel.
            </p>
          )}

          {validation.sinSede > 0 && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <span className="font-medium">{validation.sinSede} equipo{validation.sinSede === 1 ? "" : "s"} quedará{validation.sinSede === 1 ? "" : "n"} sin sede</span> porque su fila no la trae. Se ven con &quot;Todas las sedes&quot;, se encuentran con el filtro &quot;Sin sede&quot; de Activos y la sede se asigna después en Editar.
            </p>
          )}

          <MarcasNuevas marcas={marcasNuevasDeFallos(fallosRevision)} onCreadas={handleRevalidateAll} deshabilitado={validating} />

          <ResumenFallos fallos={fallosRevision} titulo={`${validation.errorCount} fila${validation.errorCount === 1 ? "" : "s"} que no se van a importar`} archivo={`errores-${categoria}`} />

          {validation.errorCount > 0 && (
            <Button variant="outline" leftIcon={<AlertCircle size={18} />} onClick={() => setShowErrorReview(true)}>
              Corregir {validation.errorCount} fila(s) aquí mismo
            </Button>
          )}

          <p className="text-sm text-fg-muted">
            {validation.errorCount === 0
              ? `Las ${validation.validCount} filas están bien y se importarán al confirmar.`
              : `Se importarán las ${validation.validCount} fila(s) válida(s)${pendingErrorCount > 0 ? ` y las que corrijas (quedan ${pendingErrorCount} sin corregir, que no se importarán).` : " y todas las que ya corregiste."}`}
          </p>

          <ResumenErrores mensaje={resumen} />
          <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              leftIcon={<ArrowLeft size={18} />}
              onClick={() => {
                setValidation(null);
                setCorrections({});
              }}
            >
              Volver
            </Button>
            <Button onClick={handleConfirmImport} loading={committing} leftIcon={<Download size={18} />}>
              Importar
            </Button>
          </div>
        </BloquePaso>
      )}

      {/* Un error de red o del servidor durante la importacion se ve aunque ya no estemos en el paso de revision. */}
      {(batchResult || showErrorReview) && (
        <>
          <ResumenErrores mensaje={resumen} />
          <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />
        </>
      )}
    </div>
  );
}
