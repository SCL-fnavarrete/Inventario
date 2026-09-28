"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { ActivosTabs } from "@/components/activos";
import { useCampoSede, useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { useEnvio } from "@/hooks/useEnvio";

// Nombre de cada campo en el resumen de errores.
const ETIQUETAS_KIT: Record<string, string> = { nombre: "Nombre", sedeId: "Sede" };

type CategoriaKit = "kit_bienvenida" | "epp";

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
};

/** Confirmacion de eliminacion, con el mismo formato que otros modales del sistema. */
type Confirmacion = {
  titulo: string;
  mensaje: string;
  textoBoton: string;
  onConfirm: () => void | Promise<void>;
};

type KitItem = {
  id: string;
  nombre: string;
  categoria: CategoriaKit;
  cantidad: number;
  stockMinimo: number;
  sedeId: string | null;
  sede?: { nombre: string } | null;
};

/**
 * Vista de catalogo/stock de un solo articulo de Kit de Bienvenida o EPP,
 * vive dentro de Activos (ver ActivosTabs), separada por categoria en vez
 * de mostrar ambas mezcladas.
 *
 * Aislamiento por sede: el backend (`/api/kit-items`, via
 * sedeWhere/sedeIdParaCrear/assertSedeAccess) ya filtra todo por sede;
 * aca solo se decide que campos mostrar -- admin ve/elige la sede de cada
 * articulo (ve varias sedes mezcladas), tecnico no ve el campo porque
 * siempre es la suya.
 */
export function KitEppCategoriaView({
  categoria,
  titulo,
}: {
  categoria: CategoriaKit;
  titulo: string;
}) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  // formData.sedeId solo lo usa la edicion (la sede que ya tiene el
  // articulo). Al crear, la sede sale de useCampoSede (SPEC 2.80).
  const formInicial = {
    nombre: "",
    categoria,
    cantidad: 0,
    stockMinimo: 5,
    sedeId: "",
  };
  const [sedeNueva, setSedeNueva, reiniciarSedeNueva] = useCampoSede();

  const [items, setItems] = useState<KitItem[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  // Una accion de guardado a la vez: un doble clic ya no envia dos veces
  // (auditoria 27-sep-2026, 6.2).
  const { enviando, ejecutar } = useEnvio();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(formInicial);
  const [error, setError] = useState("");
  // Validacion por campo, igual que en Onboarding.
  const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS_KIT);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  // Mensaje informativo (no es un error): hoy solo se usa para avisar que un
  // articulo se guardo en una sede distinta a la que filtra el menu.
  const [aviso, setAviso] = useState("");
  // Selector de sede del nav (Etapa 2): elegir una sede ahi filtra tambien
  // este catalogo, igual que ya pasa en Activos.
  const { sedeSeleccionada } = useSedeSeleccionada();

  useEffect(() => {
    fetchItems();
    fetchSedes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria, sedeSeleccionada]);

  const fetchItems = async () => {
    try {
      const params = new URLSearchParams({ categoria });
      if (sedeSeleccionada) params.append("sedeId", sedeSeleccionada);
      const res = await fetch(`/api/kit-items?${params}`);
      if (res.ok) {
        setItems(await res.json());
      }
    } catch (err) {
      console.error("Error fetching kit items:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSedes = async () => {
    try {
      const res = await fetch("/api/sedes?activas=true");
      if (res.ok) {
        setSedes(await res.json());
      }
    } catch (err) {
      console.error("Error fetching sedes:", err);
    }
  };

  const handleCreate = async () => {
    setError("");
    const faltan: Record<string, string> = {};
    if (!formData.nombre.trim()) faltan.nombre = "Escribe el nombre del artículo";
    // Todo articulo debe quedar en una sede; sin ella no se guarda.
    if (!sedeNueva) faltan.sedeId = "Elige la sede";
    if (reportar(faltan)) return;
    try {
      const res = await fetch("/api/kit-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, sedeId: sedeNueva }),
      });
      if (res.ok) {
        // Aviso cuando el articulo se guarda en una sede distinta a la que
        // filtra el menu: la fila recien creada no aparece en la tabla,
        // porque esta filtrada por la sede del selector.
        const sedeGuardada = sedeNueva;
        if (sedeSeleccionada && sedeGuardada !== sedeSeleccionada) {
          const nombreSede = sedes.find((s) => s.id === sedeGuardada)?.nombre || "otra sede";
          setAviso(
            `"${formData.nombre.trim()}" se guardó correctamente en ${nombreSede}. No aparece en esta lista porque el menú está filtrando por otra sede.`
          );
        } else {
          setAviso("");
        }
        await fetchItems();
        setIsCreating(false);
        setFormData(formInicial);
        setError("");
      } else {
        const data = await res.json();
        // Nombre repetido en la misma sede y categoria: se marca el campo.
        if (res.status === 400 && /ya existe/i.test(data.error || "")) {
          reportar({ nombre: data.error });
        } else {
          setError(data.error || "Error al crear artículo");
        }
      }
    } catch (err) {
      setError("Error al crear artículo");
      console.error(err);
    }
  };

  const handleUpdate = async (id: string) => {
    setError("");
    if (reportar(formData.nombre.trim() ? {} : { nombre: "Escribe el nombre del artículo" })) return;
    try {
      const res = await fetch(`/api/kit-items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchItems();
        setEditingId(null);
        setFormData(formInicial);
        setError("");
      } else {
        const data = await res.json();
        if (res.status === 400 && /ya existe/i.test(data.error || "")) {
          reportar({ nombre: data.error });
        } else {
          setError(data.error || "Error al actualizar artículo");
        }
      }
    } catch (err) {
      setError("Error al actualizar artículo");
      console.error(err);
    }
  };

  const pedirEliminar = (item: KitItem) => {
    setConfirmacion({
      titulo: "Eliminar artículo",
      mensaje: `"${item.nombre}" se borra del catálogo junto con su stock (${item.cantidad} unidad${item.cantidad === 1 ? "" : "es"}) y deja de poder asignarse en las solicitudes de onboarding. No se puede deshacer.`,
      textoBoton: "Eliminar",
      onConfirm: () => ejecutar(() => handleDelete(item.id)),
    });
  };

  const handleDelete = async (id: string) => {
    setConfirmacion(null);
    try {
      const res = await fetch(`/api/kit-items/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchItems();
      } else {
        const data = await res.json();
        setError(data.error || "Error al eliminar artículo");
      }
    } catch (err) {
      setError("Error al eliminar artículo");
      console.error(err);
    }
  };

  const startEdit = (item: KitItem) => {
    setEditingId(item.id);
    setFormData({
      nombre: item.nombre,
      categoria: item.categoria,
      cantidad: item.cantidad,
      stockMinimo: item.stockMinimo,
      // La sede de un articulo no se reasigna desde este formulario (se
      // hereda al crearlo, igual que Activos/Empleados).
      sedeId: item.sedeId ?? "",
    });
    setIsCreating(false);
    setError("");
    reportar({});
  };

  const cancelEdit = () => {
    reportar({});
    setEditingId(null);
    setIsCreating(false);
    setFormData(formInicial);
    setError("");
  };

  return (
    <div className="space-y-6">
      {/* Tabs del modulo: Equipos / Personal / Kit de Bienvenida / EPP */}
      <ActivosTabs />

      <PageHeader
        title={<>{titulo}</>}
        description="Artículos e insumos (no equipos) con su stock disponible. Al asignarse en una solicitud de onboarding, la cantidad se descuenta automáticamente."
        actions={
          <>
            {!isCreating && !editingId && (
              <button
                onClick={() => {
                  reportar({});
                  setIsCreating(true);
                  setFormData(formInicial);
                  // Cada articulo nuevo vuelve a partir de la sede del navbar.
                  reiniciarSedeNueva();
                }}
                className={buttonClasses()}
              >
                <Plus size={20} />
                <span>Nuevo Artículo</span>
              </button>
            )}
          </>
        }
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {aviso && (
        <div className="bg-primary-50 border border-primary-200 text-primary-900 px-4 py-3 rounded-lg flex items-start justify-between gap-3">
          <span>{aviso}</span>
          <button
            onClick={() => setAviso("")}
            className="text-primary-700 hover:text-primary-900 flex-shrink-0"
            aria-label="Cerrar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700"></div>
        </div>
      ) : (
        <>
          {isCreating && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-fg mb-4">Nuevo Artículo</h2>
              <div className="mb-4 empty:hidden">
                <ResumenErrores mensaje={resumen} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div>
                  <label className="field-label">Nombre *</label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => {
                      setFormData({ ...formData, nombre: e.target.value });
                      limpiar("nombre");
                    }}
                    className={claseCampo(errores.nombre)}
                    aria-invalid={!!errores.nombre}
                    placeholder="Ej: Libreta corporativa, Chaleco reflectante talla M"
                  />
                  <MensajeCampo mensaje={errores.nombre} />
                </div>
                <div>
                  <label className="field-label">Cantidad (stock) *</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.cantidad}
                    onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value, 10) || 0 })}
                    className="field-input"
                  />
                </div>
                <div>
                  <label className="field-label">Stock mínimo *</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.stockMinimo}
                    onChange={(e) => setFormData({ ...formData, stockMinimo: parseInt(e.target.value, 10) || 0 })}
                    className="field-input"
                  />
                  <p className="text-xs text-fg-subtle mt-1">
                    El Dashboard avisa cuando el stock llega a este número o menos.
                  </p>
                </div>
                {/* Sede visible para cualquier rol, para que el articulo siempre
                    quede con sede asignada y aparezca al filtrar el menu. */}
                <div>
                  <label className="field-label">
                    Sede <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={sedeNueva}
                    onChange={(e) => {
                      setSedeNueva(e.target.value);
                      limpiar("sedeId");
                    }}
                    disabled={!isAdmin}
                    required
                    className={claseCampo(errores.sedeId)}
                    aria-invalid={!!errores.sedeId}
                  >
                    <option value="" disabled>
                      Selecciona una sede...
                    </option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={sede.id}>
                        {sede.nombre}
                      </option>
                    ))}
                  </select>
                  <MensajeCampo mensaje={errores.sedeId} />
                  <p className="text-xs text-fg-subtle mt-1">
                    {isAdmin
                      ? "Obligatorio: sede a la que pertenece este stock."
                      : "Es tu sede: el stock que crees queda registrado en ella."}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={cancelEdit}
                  className={buttonClasses({ variant: "outline" })}
                >
                  Cancelar
                </button>
                <Button loading={enviando} leftIcon={<Save size={18} />} onClick={() => ejecutar(handleCreate)}>
                  Guardar
                </Button>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="table-th">
                    Nombre
                  </th>
                  {/* Sede visible para cualquier rol, para que el tecnico vea en
                      que sede quedo cada articulo. */}
                  <th className="table-th">
                    Sede
                  </th>
                  <th className="table-th text-center">
                    Stock disponible
                  </th>
                  <th className="table-th text-center">
                    Stock mínimo
                  </th>
                  <th className="table-th text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-line">
                {items.map((item) => (
                  <tr key={item.id}>
                    {editingId === item.id ? (
                      <>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={formData.nombre}
                            onChange={(e) => {
                              setFormData({ ...formData, nombre: e.target.value });
                              limpiar("nombre");
                            }}
                            aria-invalid={!!errores.nombre}
                            className={cn(
                              "w-full px-2 py-1 border rounded focus:ring-2 focus:ring-primary-500",
                              errores.nombre ? "border-red-500 bg-red-50" : "border-line-strong"
                            )}
                          />
                          <MensajeCampo mensaje={errores.nombre} />
                        </td>
                        <td className="px-6 py-4 text-sm text-fg-subtle">
                          {item.sede?.nombre ?? "Sin sede"}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input
                            type="number"
                            min={0}
                            value={formData.cantidad}
                            onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value, 10) || 0 })}
                            className="w-24 px-2 py-1 border border-line-strong rounded focus:ring-2 focus:ring-primary-500 text-center"
                          />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input
                            type="number"
                            min={0}
                            value={formData.stockMinimo}
                            onChange={(e) => setFormData({ ...formData, stockMinimo: parseInt(e.target.value, 10) || 0 })}
                            className="w-24 px-2 py-1 border border-line-strong rounded focus:ring-2 focus:ring-primary-500 text-center"
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button aria-label="Guardar"
                              onClick={() => ejecutar(() => handleUpdate(item.id))}
                              disabled={enviando}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Guardar"
                            >
                              <Save size={18} />
                            </button>
                            <button aria-label="Cancelar"
                              onClick={cancelEdit}
                              className="p-1 text-fg-muted hover:bg-gray-100 rounded"
                              title="Cancelar"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-fg">
                          {item.nombre}
                        </td>
                        <td className="px-6 py-4 text-sm text-fg-subtle">
                          {item.sede?.nombre ?? "Sin sede"}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              item.cantidad === 0
                                ? "bg-red-100 text-red-800"
                                : item.cantidad <= item.stockMinimo
                                ? "bg-orange-100 text-orange-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {item.cantidad}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-fg-subtle">
                          {item.stockMinimo}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button aria-label="Editar"
                              onClick={() => startEdit(item)}
                              className="p-1 text-primary-700 hover:bg-primary-50 rounded"
                              title="Editar"
                            >
                              <Edit size={18} />
                            </button>
                            {/* Eliminar sigue siendo solo admin (ver
                                permissions.ts, kitEpp.delete) -- se oculta
                                para tecnico en vez de dejar que el boton
                                falle con un 403. */}
                            {isAdmin && (
                              <button aria-label="Eliminar"
                                onClick={() => pedirEliminar(item)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                title="Eliminar"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-fg-subtle">
                      No hay artículos registrados en {titulo.toLowerCase()}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Confirmacion de eliminacion, con el mismo formato que el resto del
          sistema en vez del confirm() del navegador. */}
      <ConfirmDialog
        isOpen={confirmacion !== null}
        onClose={() => setConfirmacion(null)}
        onConfirm={() => confirmacion?.onConfirm()}
        variant="danger"
        title={confirmacion?.titulo ?? ""}
        message={confirmacion?.mensaje}
        confirmLabel={confirmacion?.textoBoton}
      />
    </div>
  );
}
