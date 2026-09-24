"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Save, Pencil, Trash2, X, Check } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";

/**
 * Administracion de los catalogos de opciones que alimentan los
 * CatalogSelect de Nuevo Activo (Sistema Operativo, Antivirus, Licencia
 * Microsoft 365). Mismo patron que Categorias de Activos: alta, editar
 * nombre y eliminar. El campo del activo sigue siendo texto plano (no una
 * relacion), asi que renombrar propaga el cambio a los activos que ya
 * tenian el nombre anterior (lo hace el backend); eliminar no les toca el
 * dato, solo deja de ofrecer esa opcion para activos nuevos.
 */

type Opcion = {
  id: string;
  nombre: string;
  activo: boolean;
  enUso: number;
};

type CatalogoKey = "sistemas-operativos" | "antivirus" | "licencias-m365";

const CATALOGOS: { key: CatalogoKey; label: string; endpoint: string; placeholder: string }[] = [
  {
    key: "sistemas-operativos",
    label: "Sistemas Operativos",
    endpoint: "/api/sistemas-operativos",
    placeholder: "Ej: Windows 11 Pro",
  },
  {
    key: "antivirus",
    label: "Antivirus",
    endpoint: "/api/antivirus",
    placeholder: "Ej: Windows Defender",
  },
  {
    key: "licencias-m365",
    label: "Licencias Microsoft 365",
    endpoint: "/api/licencias-m365",
    placeholder: "Ej: Microsoft 365 Business Premium",
  },
];

const ETIQUETAS = { nombre: "Nombre" };

export default function OpcionesActivosPage() {
  const [tabActiva, setTabActiva] = useState<CatalogoKey>(CATALOGOS[0].key);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  // Crear y renombrar usan el mismo campo "nombre": nunca estan abiertos a
  // la vez.
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);

  // Edicion de nombre en linea, en vez de un modal aparte.
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");

  // Confirmacion de eliminacion con el mismo componente que usa el resto
  // del sistema, en vez de window.confirm() del navegador.
  const [opcionAEliminar, setOpcionAEliminar] = useState<Opcion | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const catalogo = CATALOGOS.find((c) => c.key === tabActiva)!;

  const fetchOpciones = useCallback(async (endpoint: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${endpoint}?conUso=true`);
      if (res.ok) {
        const data = await res.json();
        setOpciones(data);
      }
    } catch (err) {
      console.error("Error fetching opciones:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOpciones(catalogo.endpoint);
    setIsCreating(false);
    setNombre("");
    setError("");
    setFieldErrors({});
    setEditandoId(null);
    reportar({});
  }, [catalogo.endpoint, fetchOpciones, reportar]);

  const handleCreate = async () => {
    if (reportar(nombre.trim() ? {} : { nombre: "Escribe el nombre" })) return;

    try {
      const res = await fetch(catalogo.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      });

      if (res.ok) {
        await fetchOpciones(catalogo.endpoint);
        setIsCreating(false);
        setNombre("");
        setError("");
        setFieldErrors({});
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear opción");
        if (!reportarServidor(fe)) setError(message);
      }
    } catch (err) {
      setError("Error al crear opción");
      console.error(err);
    }
  };

  const iniciarEdicion = (opcion: Opcion) => {
    setEditandoId(opcion.id);
    setNombreEditado(opcion.nombre);
    setError("");
    setFieldErrors({});
    reportar({});
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setNombreEditado("");
    reportar({});
  };

  const guardarEdicion = async (opcion: Opcion) => {
    const nuevoNombre = nombreEditado.trim();
    // Vacio: se marca, en vez de cerrar la edicion sin decir nada.
    if (reportar(nuevoNombre ? {} : { nombre: "Escribe el nombre" })) return;
    if (nuevoNombre === opcion.nombre) {
      cancelarEdicion();
      return;
    }

    try {
      const res = await fetch(`${catalogo.endpoint}/${opcion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevoNombre }),
      });

      if (res.ok) {
        await fetchOpciones(catalogo.endpoint);
        cancelarEdicion();
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al renombrar opción");
        if (!reportarServidor(fe)) setError(message);
      }
    } catch (err) {
      setError("Error al renombrar opción");
      console.error(err);
    }
  };

  const pedirEliminar = (opcion: Opcion) => {
    setOpcionAEliminar(opcion);
  };

  const confirmarEliminar = async () => {
    if (!opcionAEliminar) return;
    const opcion = opcionAEliminar;

    setEliminando(true);
    try {
      const res = await fetch(`${catalogo.endpoint}/${opcion.id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchOpciones(catalogo.endpoint);
        setOpcionAEliminar(null);
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al eliminar opción");
        setError(message);
        setFieldErrors(fe);
        setOpcionAEliminar(null);
      }
    } catch (err) {
      setError("Error al eliminar opción");
      console.error(err);
      setOpcionAEliminar(null);
    } finally {
      setEliminando(false);
    }
  };

  const cancelCreate = () => {
    setIsCreating(false);
    setNombre("");
    setError("");
    setFieldErrors({});
  };

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/configuracion"
        title="Opciones de Activos"
        description="Administra las opciones que aparecen al elegir sistema operativo, antivirus y licencia Microsoft 365 en los activos"
        actions={
          !isCreating && (
            <Button
              leftIcon={<Plus size={18} />}
              onClick={() => {
                setIsCreating(true);
                setNombre("");
                setError("");
                setFieldErrors({});
              }}
            >
              Nueva Opción
            </Button>
          )
        }
      />

      <Tabs
        items={CATALOGOS.map((c) => ({ key: c.key, label: c.label }))}
        value={tabActiva}
        onChange={setTabActiva}
      />

      <p className="text-sm text-fg-subtle">
        Editar el nombre corrige también los activos que ya lo tenían guardado. Eliminar una
        opción no modifica los activos existentes, solo deja de ofrecerla para los nuevos.
      </p>

      <ResumenErrores mensaje={resumen} />
      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Formulario de creacion */}
      {isCreating && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-fg mb-4">Nueva Opción — {catalogo.label}</h2>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="field-label">Nombre *</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  limpiar("nombre");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                aria-invalid={!!errores.nombre}
                className={claseCampo(errores.nombre)}
                placeholder={catalogo.placeholder}
                autoFocus
              />
              <MensajeCampo mensaje={errores.nombre} />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={cancelCreate}>
                Cancelar
              </Button>
              <Button leftIcon={<Save size={18} />} onClick={handleCreate}>
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de opciones */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-surface-muted">
            <tr>
              <th className="table-th">
                Nombre
              </th>
              <th className="table-th text-center">
                En uso
              </th>
              <th className="table-th text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-fg-subtle">
                  Cargando...
                </td>
              </tr>
            ) : opciones.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-fg-subtle">
                  No hay opciones registradas en {catalogo.label.toLowerCase()}
                </td>
              </tr>
            ) : (
              opciones.map((opcion) => (
                <tr key={opcion.id}>
                  <td className="px-6 py-4 font-medium text-fg">
                    {editandoId === opcion.id ? (
                      <>
                      <input
                        type="text"
                        autoFocus
                        value={nombreEditado}
                        onChange={(e) => {
                          setNombreEditado(e.target.value);
                          limpiar("nombre");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            guardarEdicion(opcion);
                          }
                          if (e.key === "Escape") cancelarEdicion();
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
                    {opcion.enUso > 0 ? `${opcion.enUso} activo${opcion.enUso === 1 ? "" : "s"}` : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      {editandoId === opcion.id ? (
                        <>
                          <button
                            onClick={() => guardarEdicion(opcion)}
                            className="p-1 rounded text-green-600 hover:bg-green-50"
                            title="Guardar"
                          >
                            <Check size={18} />
                          </button>
                          <button
                            onClick={cancelarEdicion}
                            className="p-1 rounded text-fg-subtle hover:bg-gray-100"
                            title="Cancelar"
                          >
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => iniciarEdicion(opcion)}
                            className="p-1 rounded text-primary-700 hover:bg-primary-50"
                            title="Editar nombre"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => pedirEliminar(opcion)}
                            className="p-1 rounded text-red-600 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={opcionAEliminar !== null}
        onClose={() => setOpcionAEliminar(null)}
        onConfirm={confirmarEliminar}
        loading={eliminando}
        variant="danger"
        title={`Eliminar opción — ${catalogo.label}`}
        message={
          opcionAEliminar && opcionAEliminar.enUso > 0
            ? `"${opcionAEliminar.nombre}" está guardada en ${opcionAEliminar.enUso} activo${opcionAEliminar.enUso === 1 ? "" : "s"}. Esos activos conservan el dato tal cual, pero la opción dejará de estar disponible para elegirla en activos nuevos. ¿Eliminar de todas formas?`
            : `¿Eliminar la opción "${opcionAEliminar?.nombre}"?`
        }
        confirmLabel="Eliminar"
      />
    </div>
  );
}
