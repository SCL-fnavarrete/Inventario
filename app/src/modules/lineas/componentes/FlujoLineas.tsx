"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Upload } from "lucide-react";
import {
  CAMPOS_CATALOGO,
  CAMPOS_IMPORTACION,
  LINEAS_POR_TANDA,
  descripcionDeCampoLinea,
  type CampoImportacion,
  type CatalogoLinea,
  type FilaImportacion,
  type MapeoLineas,
} from "@/modules/lineas";
import { AvanceImportacion, BloquePaso, CargaArchivo, MapeoColumnas, Pasos, ResumenFallos, type GrupoMapeo } from "@/modules/importacion/componentes";
import type { Fallo } from "@/modules/importacion";
import { parseApiError, mensajeDeError } from "@/shared/utilidades/apiErrors";
import { hoyISO } from "@/shared/utilidades/fechas";
import { Button } from "@/shared/ui/Button";
import { CampoFormulario, CampoTexto, ResumenErrores, claseInput } from "@/shared/ui/CampoFormulario";
import { StatCard, StatGrid } from "@/shared/ui/StatCard";

/**
 * Importacion de lineas dentro del asistente de Importacion de datos (SPEC 2.133):
 * 1) archivo, hoja y fecha de los datos; 2) columnas; 3) revision: valores de
 * estado, tipo de chip y operador (asociarlos a una opcion o agregarlos),
 * por que fallan las filas con error y cada linea (un numero repetido es una sola
 * linea con sus entregas anteriores); 4) guardar en tandas, con el avance. Nada se
 * guarda hasta el paso 4.
 */

type CampoCatalogo = keyof typeof CAMPOS_CATALOGO;
type Valor = { valor: string; filas: number; opcionId: string | null };
type FilaPrevia = Omit<FilaImportacion, "estadoId" | "tipoChipId" | "operadorId"> & {
  existe: boolean;
  estado: string | null;
  tipoChip: string | null;
  operador: string | null;
  errores: string[];
  avisos: string[];
};
type VistaPrevia = {
  filas: FilaPrevia[];
  valores: Record<CampoCatalogo, Valor[]>;
  resumen: { total: number; nuevas: number; existentes: number; conError: number; conAviso: number; entregasAnteriores: number; personasNuevas: number };
};
type Opcion = { id: string; nombre: string; clave?: string | null };
/** Que hacer con un valor del Excel: el id de una opcion, "nuevo" (agregarla; no en los estados, que son fijos) o "" (dejar vacio). */
type Decision = { opcion: string };
type Resultado = { fila: number; numero: string; resultado: "nueva" | "completada" | "sin cambios" | "error"; mensaje?: string };

const NUEVO = "nuevo";
const ETIQUETA_CATALOGO: Record<CampoCatalogo, string> = { estado: "Estado", tipoChip: "Tipo de chip", operador: "Operador" };

/** Las columnas del Excel, en dos grupos para que el paso no sea una lista larga. */
const GRUPOS_CAMPOS: { titulo: string; descripcion: string; campos: CampoImportacion[] }[] = [
  { titulo: "La línea", descripcion: "Los datos de la línea misma. Solo el número es obligatorio.", campos: ["numero", "estado", "tipoChip", "operador", "fechaBaja", "observaciones"] },
  { titulo: "Quién la tiene y dónde está", descripcion: "La persona se busca por RUT (o por nombre); si no existe, se crea.", campos: ["rut", "nombre", "apellidoPaterno", "apellidoMaterno", "fechaEntrega", "imei"] },
];

/** Envia un formulario con el archivo; devuelve el JSON o lanza el mensaje de error. */
async function enviar<T>(url: string, datos: Record<string, string | Blob>): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(datos)) form.append(k, v);
  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error((await parseApiError(res, "Error al leer el archivo")).message);
  return res.json();
}

export function FlujoLineas() {
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [fechaDatos, setFechaDatos] = useState(hoyISO());
  const [hojas, setHojas] = useState<string[]>([]);
  const [hoja, setHoja] = useState("");
  const [columnas, setColumnas] = useState<{ encabezados: string[]; ejemplo: Record<string, unknown>[]; total: number } | null>(null);
  const [mapeo, setMapeo] = useState<MapeoLineas>({});
  const [previa, setPrevia] = useState<VistaPrevia | null>(null);
  const [decisiones, setDecisiones] = useState<Record<string, Decision>>({});
  const [catalogos, setCatalogos] = useState<Record<CampoCatalogo, Opcion[]>>({ estado: [], tipoChip: [], operador: [] });
  const [filtro, setFiltro] = useState<"problemas" | "todas">("problemas");
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Opciones activas de los catalogos, para asociar los valores del Excel.
  const cargarCatalogos = async () => {
    const leer = async (c: CatalogoLinea) => (await fetch(`/api/lineas/catalogos/${c}?activas=true`)).json();
    const [estado, tipoChip, operador] = await Promise.all([leer("estados"), leer("tipos-chip"), leer("operadores")]);
    setCatalogos({ estado, tipoChip, operador });
  };
  useEffect(() => {
    cargarCatalogos();
  }, []);

  /** Corre una accion mostrando "ocupado" y su error, si falla. */
  const correr = async (accion: () => Promise<void>) => {
    setError("");
    setOcupado(true);
    try {
      await accion();
    } catch (e) {
      setError(mensajeDeError(e, "Error inesperado"));
    } finally {
      setOcupado(false);
    }
  };

  const quitarArchivo = () => {
    setArchivo(null);
    setHojas([]);
    setHoja("");
    setColumnas(null);
    setPrevia(null);
    setResultados(null);
    setProgreso(null);
    setPaso(1);
  };

  const leerArchivo = (f: File) =>
    correr(async () => {
      setArchivo(f);
      const r = await enviar<{ hojas: string[]; sugerida: string }>("/api/lineas/importar/hojas", { file: f });
      setHojas(r.hojas);
      setHoja(r.sugerida);
    });

  const leerColumnas = () =>
    correr(async () => {
      const r = await enviar<{ encabezados: string[]; ejemplo: Record<string, unknown>[]; mapeo: MapeoLineas; total: number }>(
        "/api/lineas/importar/columnas",
        { file: archivo!, hoja }
      );
      setColumnas(r);
      setMapeo(r.mapeo);
      setPaso(2);
    });

  const validar = () =>
    correr(async () => {
      if (!mapeo.numero) throw new Error("Elige la columna del número");
      const r = await enviar<VistaPrevia>("/api/lineas/importar/vista-previa", { file: archivo!, hoja, mapeo: JSON.stringify(mapeo) });
      setPrevia(r);
      // Por defecto: la opcion que calza por nombre; si no hay, agregarla (operador). Un tipo de
      // chip que no calza (ej. "Usado", "Nuevo": son del equipo) se deja vacio.
      // Los estados son fijos: lo que diga "baja" va a Baja y lo demas queda Activa.
      const baja = catalogos.estado.find((e) => e.clave === "baja")?.id ?? "";
      const d: Record<string, Decision> = {};
      for (const campo of Object.keys(CAMPOS_CATALOGO) as CampoCatalogo[]) {
        for (const v of r.valores[campo]) {
          d[`${campo}:${v.valor}`] = {
            opcion: v.opcionId ?? (campo === "estado" ? (/baja/i.test(v.valor) ? baja : "") : campo === "tipoChip" ? "" : NUEVO),
          };
        }
      }
      setDecisiones(d);
      setPaso(3);
    });

  const importar = () =>
    correr(async () => {
      if (!previa) return;
      // 1) Agrega a los catalogos los valores marcados como nuevos.
      const ids: Record<string, string | null> = {};
      for (const campo of Object.keys(CAMPOS_CATALOGO) as CampoCatalogo[]) {
        for (const v of previa.valores[campo]) {
          const clave = `${campo}:${v.valor}`;
          const d = decisiones[clave];
          // Un estado nunca se crea: es uno de los dos fijos o queda Activa.
          if (d.opcion !== NUEVO || campo === "estado") {
            ids[clave] = d.opcion === NUEVO ? null : d.opcion || null;
            continue;
          }
          const res = await fetch(`/api/lineas/catalogos/${CAMPOS_CATALOGO[campo]}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre: v.valor }),
          });
          if (!res.ok) throw new Error(`${ETIQUETA_CATALOGO[campo]} "${v.valor}": ${(await parseApiError(res, "no se pudo agregar")).message}`);
          ids[clave] = (await res.json()).id;
        }
      }
      // 2) Guarda las filas sin error en tandas, mostrando el avance.
      const filas: FilaImportacion[] = previa.filas
        .filter((f) => f.errores.length === 0)
        .map(({ existe: _x, estado, tipoChip, operador, errores: _e, avisos: _a, ...f }) => ({
          ...f,
          estadoId: estado ? ids[`estado:${estado}`] ?? null : null,
          tipoChipId: tipoChip ? ids[`tipoChip:${tipoChip}`] ?? null : null,
          operadorId: operador ? ids[`operador:${operador}`] ?? null : null,
        }));
      const hechos: Resultado[] = [];
      setProgreso({ hechas: 0, total: filas.length });
      setPaso(4);
      for (let i = 0; i < filas.length; i += LINEAS_POR_TANDA) {
        const res = await fetch("/api/lineas/importar/tanda", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fechaDatos, filas: filas.slice(i, i + LINEAS_POR_TANDA) }),
        });
        if (!res.ok) {
          setResultados(hechos);
          throw new Error(`Se guardaron ${hechos.length} de ${filas.length} líneas. ${(await parseApiError(res, "Error al importar")).message}`);
        }
        hechos.push(...(await res.json()));
        setProgreso({ hechas: hechos.length, total: filas.length });
      }
      setResultados(hechos);
    });

  const cuenta = (r: Resultado["resultado"]) => resultados?.filter((x) => x.resultado === r).length ?? 0;
  const visibles = previa?.filas.filter((f) => filtro === "todas" || f.errores.length || f.avisos.length) ?? [];
  // Por que no se importaria cada fila (revision) y por que fallo al guardar (resultado).
  const fallosRevision: Fallo[] = previa?.filas.flatMap((f) => f.errores.map((mensaje) => ({ fila: f.fila, mensaje, referencia: f.numero }))) ?? [];
  const fallosGuardado: Fallo[] = resultados?.filter((r) => r.resultado === "error").map((r) => ({ fila: r.fila, mensaje: r.mensaje ?? "No se pudo guardar", referencia: r.numero })) ?? [];

  return (
    <div className="space-y-6">
      <Pasos actual={paso} />

      <ResumenErrores mensaje={error} />

      {paso === 1 && (
        <BloquePaso>
          <CargaArchivo archivo={archivo} onElegir={leerArchivo} onQuitar={quitarArchivo} deshabilitado={ocupado} />
          {hojas.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CampoFormulario label="Hoja del Excel" obligatorio htmlFor="lineas-hoja">
                <select id="lineas-hoja" value={hoja} onChange={(e) => setHoja(e.target.value)} className={claseInput()}>
                  {hojas.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </CampoFormulario>
              <CampoTexto
                label="Fecha de los datos"
                type="date"
                max={hoyISO()}
                value={fechaDatos}
                onChange={setFechaDatos}
                ayuda="Desde esta fecha rige el estado importado."
              />
            </div>
          )}
          <div className="flex justify-end">
            <Button disabled={!archivo || !hoja} loading={ocupado} rightIcon={<ArrowRight size={18} />} onClick={leerColumnas}>
              Continuar
            </Button>
          </div>
        </BloquePaso>
      )}

      {paso === 2 && columnas && (
        <BloquePaso>
          <p className="text-sm text-fg-muted">
            La hoja &quot;{hoja}&quot; tiene {columnas.total} filas. Revisa qué columna del Excel corresponde a cada dato; se propusieron por su nombre.
          </p>
          <MapeoColumnas
            grupos={GRUPOS_CAMPOS.map<GrupoMapeo>((g) => ({
              titulo: g.titulo,
              descripcion: g.descripcion,
              campos: g.campos.map((campo) => {
                const def = CAMPOS_IMPORTACION.find((c) => c.campo === campo)!;
                return { key: campo, etiqueta: def.etiqueta, obligatorio: "obligatorio" in def, ayuda: descripcionDeCampoLinea(campo) };
              }),
            }))}
            encabezados={columnas.encabezados}
            mapeo={mapeo}
            onCambio={(campo, columna) => setMapeo({ ...mapeo, [campo]: columna || undefined })}
            ejemplo={(columna, campo) => {
              const v = columnas.ejemplo.find((f) => f[columna] != null)?.[columna];
              if (v == null) return undefined;
              // Una fecha de Excel llega como numero de serie (45714): se muestra como fecha.
              if ((campo === "fechaEntrega" || campo === "fechaBaja") && typeof v === "number" && v > 20000 && v < 80000) {
                return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10).split("-").reverse().join("-");
              }
              return String(v);
            }}
          />
          <div className="flex justify-between">
            <Button variant="outline" leftIcon={<ArrowLeft size={18} />} onClick={() => setPaso(1)}>
              Atrás
            </Button>
            <Button loading={ocupado} rightIcon={<ArrowRight size={18} />} onClick={validar}>
              Revisar
            </Button>
          </div>
        </BloquePaso>
      )}

      {paso === 3 && previa && (
        <div className="space-y-4">
          <StatGrid cols={5}>
            <StatCard variant="soft" label="Líneas" value={previa.resumen.total} />
            <StatCard variant="soft" label="Nuevas" value={previa.resumen.nuevas} tone="success" />
            <StatCard variant="soft" label="Ya existen (se completan)" value={previa.resumen.existentes} tone="primary" />
            <StatCard variant="soft" label="Con aviso (se importan)" value={previa.resumen.conAviso} tone="warning" />
            <StatCard variant="soft" label="Con error (no se importan)" value={previa.resumen.conError} tone="danger" />
          </StatGrid>

          <ResumenFallos fallos={fallosRevision} titulo={`${previa.resumen.conError} línea${previa.resumen.conError === 1 ? "" : "s"} que no se van a importar`} archivo="errores-lineas" />

          {previa.resumen.entregasAnteriores > 0 && (
            <p className="text-sm text-fg-muted">
              {previa.resumen.entregasAnteriores} entregas anteriores del archivo quedarán en el historial de sus líneas (&quot;Quién la ha tenido&quot;).
            </p>
          )}
          {previa.resumen.personasNuevas > 0 && (
            <p className="text-sm text-fg-muted">
              {previa.resumen.personasNuevas} persona(s) no están en el sistema y se crearán: activa si tiene hoy la línea, desvinculada si
              solo la tuvo antes. Completa su correo y cargo en Personal.
            </p>
          )}

          {(Object.keys(CAMPOS_CATALOGO) as CampoCatalogo[]).map((campo) =>
            previa.valores[campo].length === 0 ? null : (
              <div key={campo} className="card p-4">
                <h3 className="mb-1 text-sm font-semibold text-fg">{ETIQUETA_CATALOGO[campo]}: valores del archivo</h3>
                <p className="mb-3 text-xs text-fg-subtle">
                  {campo === "estado"
                    ? "Los estados son fijos: asocia cada valor del archivo a uno de ellos. Lo que no asocies queda Activa."
                    : "Asocia cada valor a una opción del sistema, o agrégalo como nueva."}
                </p>
                <div className="space-y-2">
                  {previa.valores[campo].map((v) => {
                    const clave = `${campo}:${v.valor}`;
                    const d = decisiones[clave];
                    const poner = (cambio: Partial<Decision>) => setDecisiones({ ...decisiones, [clave]: { ...d, ...cambio } });
                    return (
                      <div key={clave} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_1fr_auto]">
                        <span className="text-sm text-fg">
                          {v.valor} <span className="text-fg-subtle">({v.filas} {v.filas === 1 ? "línea" : "líneas"})</span>
                        </span>
                        <select value={d.opcion} onChange={(e) => poner({ opcion: e.target.value })} className={claseInput()} aria-label={`Qué hacer con ${v.valor}`}>
                          {campo !== "estado" && <option value={NUEVO}>Agregar &quot;{v.valor}&quot; como nuevo</option>}
                          <option value="">{campo === "estado" ? "Dejar Activa" : "Dejar vacío"}</option>
                          {catalogos[campo].map((o) => (
                            <option key={o.id} value={o.id}>
                              → {o.nombre}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-fg">Filas</h3>
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className="field-input w-auto" aria-label="Filas a mostrar">
                <option value="problemas">Con error o aviso</option>
                <option value="todas">Todas</option>
              </select>
            </div>
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-muted">
                  <tr>
                    {["Fila", "Número", "Chip", "Operador", "Persona", "Historial", "Revisión"].map((t) => (
                      <th key={t} className="table-th">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibles.slice(0, 300).map((f) => (
                    <tr key={f.fila} className={f.errores.length ? "bg-red-50 dark:bg-red-950/30" : ""}>
                      <td className="px-3 py-2 text-fg-subtle">{f.fila}</td>
                      <td className="px-3 py-2 font-mono">{f.numero}</td>
                      <td className="px-3 py-2">{f.tipoChip ?? "—"}</td>
                      <td className="px-3 py-2">{f.operador ?? "—"}</td>
                      <td className="px-3 py-2">
                        {f.nombre ?? "—"}
                        {f.rut && <span className="block text-xs text-fg-subtle">{f.rut}</span>}
                      </td>
                      <td className="px-3 py-2 text-fg-subtle">{f.entregas.length ? `+${f.entregas.length} anteriores` : ""}</td>
                      <td className="px-3 py-2">
                        {f.existe && <span className="block text-xs text-fg-subtle">Ya existe: solo se completan datos vacíos</span>}
                        {[...f.errores, ...f.avisos].map((m) => (
                          <span key={m} className={`block text-xs ${f.errores.includes(m) ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                            {m}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {visibles.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-fg-subtle">
                        Ninguna fila con error o aviso.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" leftIcon={<ArrowLeft size={18} />} onClick={() => setPaso(2)}>
              Atrás
            </Button>
            <Button loading={ocupado} leftIcon={<Upload size={18} />} disabled={previa.resumen.total === previa.resumen.conError} onClick={importar}>
              Importar {previa.resumen.total - previa.resumen.conError} líneas
            </Button>
          </div>
        </div>
      )}

      {paso === 4 && progreso && (
        <div className="space-y-4">
          <AvanceImportacion hechas={progreso.hechas} total={progreso.total} texto={resultados ? "Importación terminada" : "Importando líneas..."} />
          {resultados && (
            <>
              <StatGrid cols={4}>
                <StatCard variant="soft" label="Nuevas" value={cuenta("nueva")} tone="success" />
                <StatCard variant="soft" label="Completadas" value={cuenta("completada")} tone="primary" />
                <StatCard variant="soft" label="Sin cambios" value={cuenta("sin cambios")} />
                <StatCard variant="soft" label="Con error" value={cuenta("error")} tone="danger" />
              </StatGrid>
              <ResumenFallos fallos={fallosGuardado} titulo="Líneas que no se pudieron guardar" archivo="errores-lineas" />
              <Link href="/activos/lineas" className="inline-block text-sm text-brand hover:underline">
                Ver las líneas →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
