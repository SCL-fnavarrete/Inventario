"use client";

import { useEffect, useState } from "react";
import { Plus, Edit, Trash2, Save } from "lucide-react";
import type { TipoFicha } from "@prisma/client";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { TablaAdaptable } from "@/components/ui/TablaAdaptable";
import { CampoFormulario, CampoTexto, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { useEnvio } from "@/hooks/useEnvio";
import { camposComunes, TIPOS_FICHA, TIPO_FICHA_LABEL, type CampoFicha } from "@/lib/constants/categorias";

/**
 * Catalogos de Activos > Categorias (SPEC 2.112.7). Un solo formulario para
 * crear y editar (antes se editaba dentro de la fila); "Que campos pide"
 * decide los campos especiales del formulario de activos, en vez del nombre.
 */

type Categoria = {
  id: string;
  nombre: string;
  descripcion: string | null;
  stockMinimo: number;
  tipoFicha: TipoFicha;
  _count?: { assets: number };
};

const FORM_INICIAL = {
  nombre: "",
  descripcion: "",
  stockMinimo: "3",
  tipoFicha: "generico" as TipoFicha,
};

/** Campos separados por coma; los obligatorios en negrita y con asterisco. */
function ListaCampos({ campos }: { campos: CampoFicha[] }) {
  return (
    <>
      {campos.map((c, i) => (
        <span key={c.nombre}>
          {i > 0 && ", "}
          {c.obligatorio ? <span className="font-medium text-fg">{c.nombre} *</span> : c.nombre}
        </span>
      ))}
    </>
  );
}

const ETIQUETAS = { nombre: "Nombre", stockMinimo: "Stock mínimo", tipoFicha: "Qué campos pide" };

export function CategoriasCatalogo() {
  const toast = useToast();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  // Una accion de guardado a la vez: un doble clic ya no envia dos veces
  // (auditoria 27-sep-2026, 6.2).
  const { enviando, ejecutar } = useEnvio();
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

  const camposFicha = TIPOS_FICHA.find((t) => t.valor === form.tipoFicha)?.campos ?? [];

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
            <CampoFormulario label="Qué campos pide" obligatorio error={errores.tipoFicha}>
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
            {/* Los campos que tendra cada activo de esta categoria. */}
            <div className="rounded-lg border border-line bg-surface-muted p-4 text-sm md:col-span-2">
              <p className="font-medium text-fg">Campos que tendrá cada activo de esta categoría</p>
              <p className="mt-2 text-fg-muted">
                <span className="font-medium text-fg">
                  {camposFicha.length ? `Propios de ${TIPO_FICHA_LABEL[form.tipoFicha]}:` : "Sin campos propios:"}
                </span>{" "}
                {camposFicha.length ? <ListaCampos campos={camposFicha} /> : "solo los de todos los activos."}
              </p>
              <p className="mt-1 text-fg-muted">
                <span className="font-medium text-fg">Todos los activos:</span>{" "}
                <ListaCampos campos={camposComunes(form.tipoFicha)} />
              </p>
              <p className="mt-2 text-xs text-fg-subtle">
                * Obligatorio al crear el activo.
                {form.tipoFicha === "celular" && " En los celulares el N° de serie es opcional: los identifica su IMEI."}
                {(form.tipoFicha === "computador" || form.tipoFicha === "celular") &&
                  " Cargador viene en «Sí»: al entregar y devolver el equipo se pregunta su estado y se imprime en el acta."}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            <Button loading={enviando} leftIcon={<Save size={18} />} onClick={() => ejecutar(guardar)}>
              Guardar
            </Button>
          </div>
        </div>
      )}

      {cargando ? (
        <p className="card px-6 py-8 text-center text-fg-subtle">Cargando...</p>
      ) : (
        <TablaAdaptable
          items={categorias}
          clave={(c) => c.id}
          vacio="No hay categorías registradas"
          resaltada={(c) => abierto === c.id}
          columnas={[
            {
              titulo: "Nombre",
              celda: (c) => (
                <>
                  <p className="font-medium text-fg">{c.nombre}</p>
                  {c.descripcion && <p className="text-xs text-fg-subtle">{c.descripcion}</p>}
                </>
              ),
            },
            { titulo: "Qué campos pide", celda: (c) => TIPO_FICHA_LABEL[c.tipoFicha], className: "text-fg-muted" },
            { titulo: "Stock mínimo", celda: (c) => c.stockMinimo, className: "text-center text-fg-subtle" },
            { titulo: "Activos", celda: (c) => c._count?.assets ?? 0, className: "text-center text-fg-subtle" },
          ]}
          tarjeta={(c) => (
            <>
              <p className="font-medium text-fg">{c.nombre}</p>
              <p className="text-xs text-fg-muted">
                {TIPO_FICHA_LABEL[c.tipoFicha]} · {c._count?.assets ?? 0} activo(s) · stock mínimo {c.stockMinimo}
              </p>
            </>
          )}
          acciones={(c) => {
            const activos = c._count?.assets ?? 0;
            return (
              <>
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
                  title={activos > 0 ? `No se puede eliminar: tiene ${activos} activo(s). Cambia su categoría primero.` : "Eliminar"}
                  aria-label={`Eliminar ${c.nombre}`}
                >
                  <Trash2 size={18} />
                </button>
              </>
            );
          }}
        />
      )}

      <ConfirmDialog
        isOpen={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={() => ejecutar(eliminar)}
        loading={enviando}
        variant="danger"
        title="Eliminar categoría"
        message={`La categoría "${aEliminar?.nombre}" se borra del catálogo y deja de aparecer al crear activos. No tiene activos, así que no afecta a ninguno.`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
