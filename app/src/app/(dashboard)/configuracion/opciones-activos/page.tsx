"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Save, Pencil, Trash2, X, Check } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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

export default function OpcionesActivosPage() {
  const [tabActiva, setTabActiva] = useState<CatalogoKey>(CATALOGOS[0].key);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

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
  }, [catalogo.endpoint, fetchOpciones]);

  const handleCreate = async () => {
    if (!nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }

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
        setError(message);
        setFieldErrors(fe);
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
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setNombreEditado("");
  };

  const guardarEdicion = async (opcion: Opcion) => {
    const nuevoNombre = nombreEditado.trim();
    if (!nuevoNombre || nuevoNombre === opcion.nombre) {
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
        setError(message);
        setFieldErrors(fe);
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Opciones de Activos</h1>
        <p className="text-gray-600 mt-1">
          Administra las opciones que aparecen al elegir sistema operativo, antivirus y
          licencia Microsoft 365 en los activos
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {CATALOGOS.map((c) => (
          <button
            key={c.key}
            onClick={() => setTabActiva(c.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tabActiva === c.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Editar el nombre corrige también los activos que ya lo tenían guardado. Eliminar
          una opción no modifica los activos existentes, solo deja de ofrecerla para los
          nuevos.
        </p>
        {!isCreating && (
          <button
            onClick={() => {
              setIsCreating(true);
              setNombre("");
              setError("");
              setFieldErrors({});
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Nueva Opción</span>
          </button>
        )}
      </div>

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Formulario de creacion */}
      {isCreating && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Nueva Opción — {catalogo.label}</h2>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={catalogo.placeholder}
                autoFocus
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={cancelCreate}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Save size={18} />
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla de opciones */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nombre
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                En uso
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  Cargando...
                </td>
              </tr>
            ) : opciones.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  No hay opciones registradas en {catalogo.label.toLowerCase()}
                </td>
              </tr>
            ) : (
              opciones.map((opcion) => (
                <tr key={opcion.id}>
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {editandoId === opcion.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={nombreEditado}
                        onChange={(e) => setNombreEditado(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            guardarEdicion(opcion);
                          }
                          if (e.key === "Escape") cancelarEdicion();
                        }}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    ) : (
                      opcion.nombre
                    )}
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-600">
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
                            className="p-1 rounded text-gray-500 hover:bg-gray-100"
                            title="Cancelar"
                          >
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => iniciarEdicion(opcion)}
                            className="p-1 rounded text-blue-600 hover:bg-blue-50"
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
