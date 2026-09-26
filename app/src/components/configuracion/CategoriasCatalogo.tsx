"use client";

import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, Save } from "lucide-react";
import type { TipoFicha } from "@prisma/client";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { CampoFormulario, CampoTexto, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { TIPOS_FICHA, TIPO_FICHA_LABEL } from "@/lib/constants/categorias";

/**
 * Catalogos de Activos > Categorias (SPEC 2.112.7). Un solo formulario para
 * crear y editar (antes se editaba dentro de la fila); "Que campos pide"
 * decide los campos especiales del formulario de activos, en vez del nombre.
 */

type Categoria = {
  id: string;
  nombre: string;
  descripcion: string | null;
  requiereSerie: boolean;
  requiereImei: boolean;
  stockMinimo: number;
  tipoFicha: TipoFicha;
  _count?: { assets: number };
};

const FORM_INICIAL = {
  nombre: "",
  descripcion: "",
  requiereSerie: true,
  requiereImei: false,
  stockMinimo: "3",
  tipoFicha: "generico" as TipoFicha,
};

const ETIQUETAS = { nombre: "Nombre", stockMinimo: "Stock mínimo", tipoFicha: "Qué campos pide" };

const Si = ({ si }: { si: boolean }) => (
  <span
    className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
      si ? "bg-green-100 text-green-800" : "bg-gray-100 text-fg-muted"
    }`}
  >
    {si ? "Sí" : "No"}
  </span>
);

export function CategoriasCatalogo() {
  const toast = useToast();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  // null = cerrado, "nueva" = creando, id = editando esa categoria.
  const [abierto, setAbierto] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [aEliminar, setAEliminar] = useState<Categoria | null>(null);
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);

  const cargar = async () => {
    try {
      const res = await fetch("/api/categorias?includeCount=true");
      if (res.ok) setCategorias(await res.json());
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const cambiar = <K extends keyof typeof FORM_INICIAL>(campo: K, valor: (typeof FORM_INICIAL)[K]) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    limpiar(campo);
  };

  const abrir = (categoria?: Categoria) => {
    setAbierto(categoria?.id ?? "nueva");
    setForm(
      categoria
        ? {
            nombre: categoria.nombre,
            descripcion: categoria.descripcion ?? "",
            requiereSerie: categoria.requiereSerie,
            requiereImei: categoria.requiereImei,
            stockMinimo: String(categoria.stockMinimo),
            tipoFicha: categoria.tipoFicha,
          }
        : FORM_INICIAL
    );
    setError("");
    setFieldErrors({});
    reportar({});
  };

  const cerrar = () => {
    setAbierto(null);
    setForm(FORM_INICIAL);
    setError("");
    setFieldErrors({});
    reportar({});
  };

  const guardar = async () => {
    const e: Record<string, string> = {};
    if (!form.nombre.trim()) e.nombre = "Escribe el nombre";
    if (!/^\d+$/.test(form.stockMinimo.trim())) e.stockMinimo = "Escribe un número entero, 0 o más";
    if (reportar(e)) return;

    const nueva = abierto === "nueva";
    try {
      const res = await fetch(nueva ? "/api/categorias" : `/api/categorias/${abierto}`, {
        method: nueva ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, stockMinimo: Number(form.stockMinimo) }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al guardar la categoría");
        if (!reportarServidor(fe)) setError(message);
        return;
      }
      await cargar();
      cerrar();
      toast.success(nueva ? "Categoría creada" : "Categoría guardada");
    } catch {
      setError("Error al guardar la categoría");
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    const categoria = aEliminar;
    setAEliminar(null);
    try {
      const res = await fetch(`/api/categorias/${categoria.id}`, { method: "DELETE" });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al eliminar la categoría");
        setError(message);
        setFieldErrors(fe);
        return;
      }
      await cargar();
      toast.success("Categoría eliminada");
    } catch {
      setError("Error al eliminar la categoría");
    }
  };

  const detalleFicha = TIPOS_FICHA.find((t) => t.valor === form.tipoFicha)?.detalle;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-fg-subtle">
          Clasifican los activos. &ldquo;Qué campos pide&rdquo; decide los datos especiales del formulario de
          activos, así que puedes renombrar una categoría sin romper nada.
        </p>
        {!abierto && (
          <Button leftIcon={<Plus size={18} />} onClick={() => abrir()} className="shrink-0">
            Nueva categoría
          </Button>
        )}
      </div>

      <ResumenErrores mensaje={resumen} />
      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {abierto && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">
            {abierto === "nueva" ? "Nueva categoría" : "Editar categoría"}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CampoTexto
              label="Nombre"
              obligatorio
              value={form.nombre}
              onChange={(v) => cambiar("nombre", v)}
              error={errores.nombre}
              placeholder="Ej: Notebook, Celular, Monitor"
            />
            <CampoTexto
              label="Descripción"
              value={form.descripcion}
              onChange={(v) => cambiar("descripcion", v)}
              placeholder="Descripción de la categoría"
            />
            <CampoFormulario label="Qué campos pide" obligatorio error={errores.tipoFicha} ayuda={detalleFicha}>
              <select
                value={form.tipoFicha}
                onChange={(e) => cambiar("tipoFicha", e.target.value as TipoFicha)}
                className={claseCampo(errores.tipoFicha)}
              >
                {TIPOS_FICHA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.label}
                  </option>
                ))}
              </select>
            </CampoFormulario>
            <CampoTexto
              label="Stock mínimo (disponibles)"
              obligatorio
              type="number"
              min={0}
              value={form.stockMinimo}
              onChange={(v) => cambiar("stockMinimo", v)}
              error={errores.stockMinimo}
              ayuda="El Dashboard avisa cuando los activos disponibles de esta categoría llegan a este número o menos."
            />
            <div className="md:col-span-2">
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input
                    type="checkbox"
                    checked={form.requiereSerie}
                    onChange={(e) => cambiar("requiereSerie", e.target.checked)}
                    className="field-checkbox"
                  />
                  Pide N° de serie
                </label>
                <label className="flex items-center gap-2 text-sm text-fg-muted">
                  <input
                    type="checkbox"
                    checked={form.requiereImei}
                    onChange={(e) => cambiar("requiereImei", e.target.checked)}
                    className="field-checkbox"
                  />
                  Pide IMEI
                </label>
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                Si falta el dato, se avisa al crear, editar o importar un activo de esta categoría (no impide
                guardar).
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            <Button leftIcon={<Save size={18} />} onClick={guardar}>
              Guardar
            </Button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-surface-muted">
              <tr>
                <th className="table-th">Nombre</th>
                <th className="table-th">Qué campos pide</th>
                <th className="table-th hidden text-center md:table-cell">Pide serie</th>
                <th className="table-th hidden text-center md:table-cell">Pide IMEI</th>
                <th className="table-th hidden text-center sm:table-cell">Stock mínimo</th>
                <th className="table-th text-center">Activos</th>
                <th className="table-th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-surface">
              {cargando ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-fg-subtle">
                    Cargando...
                  </td>
                </tr>
              ) : categorias.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-fg-subtle">
                    No hay categorías registradas
                  </td>
                </tr>
              ) : (
                categorias.map((c) => {
                  const activos = c._count?.assets ?? 0;
                  return (
                    <tr key={c.id} className={abierto === c.id ? "bg-primary-50/40" : undefined}>
                      <td className="px-6 py-4">
                        <p className="font-medium text-fg">{c.nombre}</p>
                        {c.descripcion && <p className="text-xs text-fg-subtle">{c.descripcion}</p>}
                      </td>
                      <td className="px-6 py-4 text-sm text-fg-muted">{TIPO_FICHA_LABEL[c.tipoFicha]}</td>
                      <td className="hidden px-6 py-4 text-center md:table-cell">
                        <Si si={c.requiereSerie} />
                      </td>
                      <td className="hidden px-6 py-4 text-center md:table-cell">
                        <Si si={c.requiereImei} />
                      </td>
                      <td className="hidden px-6 py-4 text-center text-fg-subtle sm:table-cell">{c.stockMinimo}</td>
                      <td className="px-6 py-4 text-center text-fg-subtle">{activos}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => abrir(c)}
                            className="rounded p-1 text-primary-700 hover:bg-primary-50"
                            title="Editar"
                            aria-label={`Editar ${c.nombre}`}
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => setAEliminar(c)}
                            disabled={activos > 0}
                            className="rounded p-1 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                            title={
                              activos > 0
                                ? `No se puede eliminar: tiene ${activos} activo(s). Cambia su categoría primero.`
                                : "Eliminar"
                            }
                            aria-label={`Eliminar ${c.nombre}`}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={eliminar}
        variant="danger"
        title="Eliminar categoría"
        message={`La categoría "${aEliminar?.nombre}" se borra del catálogo y deja de aparecer al crear activos. No tiene activos, así que no afecta a ninguno.`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
