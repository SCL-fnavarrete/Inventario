"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Pencil, Trash2, X, Check } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { CampoTexto, MensajeCampo, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";

/**
 * Catalogos de Activos > Sistemas operativos / Antivirus / Licencias M365
 * (SPEC 2.112.7): las opciones de los selectores del formulario de activos.
 * Una sola pieza para los tres; la pagina la monta con `key` por catalogo,
 * asi cada pestaña parte limpia.
 *
 * El campo del activo es texto plano: renombrar corrige los activos que ya
 * tenian el nombre anterior (lo hace el backend); eliminar no los toca.
 */

type Opcion = { id: string; nombre: string; activo: boolean; enUso: number };

const ETIQUETAS = { nombre: "Nombre" };
const activos = (n: number) => `${n} activo${n === 1 ? "" : "s"}`;

export function OpcionesCatalogo({
  endpoint,
  titulo,
  placeholder,
}: {
  endpoint: string;
  titulo: string;
  placeholder: string;
}) {
  const toast = useToast();
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [aEliminar, setAEliminar] = useState<Opcion | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Crear y renombrar usan el mismo campo "nombre": nunca estan abiertos a
  // la vez.
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${endpoint}?conUso=true`);
      if (res.ok) setOpciones(await res.json());
    } finally {
      setCargando(false);
    }
  }, [endpoint]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const limpiarErrores = () => {
    setError("");
    setFieldErrors({});
    reportar({});
  };

  /** Envia y maneja la respuesta; true si salio bien. */
  const enviar = async (url: string, method: string, body: unknown, mensajeError: string) => {
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) {
        await cargar();
        return true;
      }
      const { message, fieldErrors: fe } = await parseApiError(res, mensajeError);
      if (!reportarServidor(fe)) setError(message);
    } catch {
      setError(mensajeError);
    }
    return false;
  };

  const crear = async () => {
    if (reportar(nombre.trim() ? {} : { nombre: "Escribe el nombre" })) return;
    if (await enviar(endpoint, "POST", { nombre }, "Error al crear la opción")) {
      setCreando(false);
      setNombre("");
      toast.success("Opción guardada");
    }
  };

  const renombrar = async (opcion: Opcion) => {
    const nuevo = nombreEditado.trim();
    // Vacio: se marca, en vez de cerrar la edicion sin decir nada.
    if (reportar(nuevo ? {} : { nombre: "Escribe el nombre" })) return;
    if (nuevo === opcion.nombre) return setEditandoId(null);
    if (await enviar(`${endpoint}/${opcion.id}`, "PATCH", { nombre: nuevo }, "Error al renombrar la opción")) {
      setEditandoId(null);
      toast.success(opcion.enUso ? `Opción renombrada y ${activos(opcion.enUso)} corregidos` : "Opción renombrada");
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    const ok = await enviar(`${endpoint}/${aEliminar.id}`, "DELETE", null, "Error al eliminar la opción");
    setEliminando(false);
    setAEliminar(null);
    if (ok) toast.success("Opción eliminada");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-subtle">
          Renombrar corrige también los activos que ya la tenían. Eliminar no modifica los activos existentes,
          solo deja de ofrecerla para los nuevos.
        </p>
        {!creando && (
          <Button
            leftIcon={<Plus size={18} />}
            className="shrink-0"
            onClick={() => {
              setCreando(true);
              setEditandoId(null);
              setNombre("");
              limpiarErrores();
            }}
          >
            Nueva opción
          </Button>
        )}
      </div>

      <ResumenErrores mensaje={resumen} />
      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {creando && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">Nueva opción — {titulo}</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <CampoTexto
              className="flex-1"
              label="Nombre"
              obligatorio
              value={nombre}
              onChange={(v) => {
                setNombre(v);
                limpiar("nombre");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  crear();
                }
              }}
              error={errores.nombre}
              placeholder={placeholder}
              autoFocus
            />
            <div className="flex gap-3 sm:pt-6">
              <Button variant="outline" onClick={() => setCreando(false)}>
                Cancelar
              </Button>
              <Button leftIcon={<Save size={18} />} onClick={crear}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-surface-muted">
            <tr>
              <th className="table-th">Nombre</th>
              <th className="table-th text-center">En uso</th>
              <th className="table-th text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface">
            {cargando ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-fg-subtle">
                  Cargando...
                </td>
              </tr>
            ) : opciones.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-fg-subtle">
                  No hay opciones registradas en {titulo.toLowerCase()}
                </td>
              </tr>
            ) : (
              opciones.map((opcion) => {
                const editando = editandoId === opcion.id;
                return (
                  <tr key={opcion.id}>
                    <td className="px-6 py-4 font-medium text-fg">
                      {editando ? (
                        <>
                          <input
                            type="text"
                            autoFocus
                            aria-label={`Nuevo nombre de ${opcion.nombre}`}
                            value={nombreEditado}
                            onChange={(e) => {
                              setNombreEditado(e.target.value);
                              limpiar("nombre");
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                renombrar(opcion);
                              }
                              if (e.key === "Escape") setEditandoId(null);
                            }}
                            aria-invalid={!!errores.nombre}
                            className={claseCampo(errores.nombre)}
                          />
                          <MensajeCampo mensaje={errores.nombre} />
                        </>
                      ) : (
                        opcion.nombre
                      )}
                    </td>
                    <td className="px-6 py-4 text-center text-sm text-fg-muted">
                      {opcion.enUso > 0 ? activos(opcion.enUso) : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        {editando ? (
                          <>
                            <button
                              onClick={() => renombrar(opcion)}
                              className="rounded p-1 text-green-600 hover:bg-green-50"
                              title="Guardar"
                            >
                              <Check size={18} />
                            </button>
                            <button
                              onClick={() => setEditandoId(null)}
                              className="rounded p-1 text-fg-subtle hover:bg-surface-muted"
                              title="Cancelar"
                            >
                              <X size={18} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditandoId(opcion.id);
                                setNombreEditado(opcion.nombre);
                                setCreando(false);
                                limpiarErrores();
                              }}
                              className="rounded p-1 text-primary-700 hover:bg-primary-50"
                              title="Editar nombre"
                              aria-label={`Editar ${opcion.nombre}`}
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() => setAEliminar(opcion)}
                              className="rounded p-1 text-red-600 hover:bg-red-50"
                              title="Eliminar"
                              aria-label={`Eliminar ${opcion.nombre}`}
                            >
                              <Trash2 size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={eliminar}
        loading={eliminando}
        variant="danger"
        title={`Eliminar opción — ${titulo}`}
        message={
          aEliminar && aEliminar.enUso > 0
            ? `"${aEliminar.nombre}" está guardada en ${activos(aEliminar.enUso)}. Esos activos conservan el dato tal cual, pero la opción dejará de estar disponible para activos nuevos. ¿Eliminar de todas formas?`
            : `¿Eliminar la opción "${aEliminar?.nombre}"?`
        }
        confirmLabel="Eliminar"
      />
    </div>
  );
}
