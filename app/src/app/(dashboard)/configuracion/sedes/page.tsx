"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Save, MapPin, Trash2 } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/shared/utilidades/apiErrors";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";
import { useToast } from "@/shared/ui/Toast";
import { Button } from "@/shared/ui/Button";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { PageHeader } from "@/shared/ui/PageHeader";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import { CampoTexto, ResumenErrores } from "@/shared/ui/CampoFormulario";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { useEnvio } from "@/shared/hooks/useEnvio";
import { usoSedeEnPalabras, type UsoSede } from "@/modules/configuracion";

/**
 * Configuracion > Sedes. Un solo formulario para crear y editar (antes el
 * nombre se editaba dentro de la fila, que en celular no cabia) y la lista
 * adaptable (SPEC 2.112.9). Una sede no se desactiva: se elimina solo si nada
 * la usa, y si la usa algo el boton dice que (SPEC 2.170).
 */

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
  // Todo lo que la usa: con algo, no se puede eliminar.
  _count: UsoSede;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const ETIQUETAS = { codigo: "Código", nombre: "Nombre" };
const FORM_INICIAL = { codigo: "", nombre: "" };

export default function SedesPage() {
  const toast = useToast();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargando, setCargando] = useState(true);
  // Una accion de guardado a la vez: un doble clic ya no envia dos veces
  // (auditoria 27-sep-2026, 6.2).
  const { enviando, ejecutar } = useEnvio();
  // null = cerrado, "nueva" = creando, id = editando esa sede.
  const [abierto, setAbierto] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Sede que se va a eliminar, a la espera de confirmar.
  const [porEliminar, setPorEliminar] = useState<Sede | null>(null);
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);

  const cargar = async () => {
    try {
      const res = await fetch("/api/sedes?conUso=true");
      if (res.ok) setSedes(await res.json());
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const cambiar = (campo: keyof typeof FORM_INICIAL, valor: string) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    limpiar(campo);
  };

  const limpiarErrores = () => {
    setError("");
    setFieldErrors({});
    reportar({});
  };

  const abrir = (sede?: Sede) => {
    setAbierto(sede?.id ?? "nueva");
    setForm(sede ? { codigo: sede.codigo, nombre: sede.nombre } : FORM_INICIAL);
    limpiarErrores();
  };

  const cerrar = () => {
    setAbierto(null);
    setForm(FORM_INICIAL);
    limpiarErrores();
  };

  const guardar = async () => {
    const nueva = abierto === "nueva";
    const e: Record<string, string> = {};
    if (nueva && !form.codigo.trim()) e.codigo = "Escribe el código";
    if (!form.nombre.trim()) e.nombre = "Escribe el nombre";
    if (reportar(e)) return;
    try {
      const res = await fetch(nueva ? "/api/sedes" : `/api/sedes/${abierto}`, {
        method: nueva ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        // El codigo no se edita: es la referencia estable de la sede.
        body: JSON.stringify(nueva ? form : { nombre: form.nombre }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al guardar la sede");
        if (!reportarServidor(fe)) setError(message);
        return;
      }
      await cargar();
      cerrar();
      toast.success(nueva ? "Sede creada" : "Sede guardada");
    } catch {
      setError("Error al guardar la sede");
    }
  };

  const eliminar = async (sede: Sede) => {
    setPorEliminar(null);
    try {
      const res = await fetch(`/api/sedes/${sede.id}`, { method: "DELETE" });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al eliminar la sede");
        setError(message);
        setFieldErrors(fe);
        return;
      }
      await cargar();
      toast.success("Sede eliminada");
    } catch {
      setError("Error al eliminar la sede");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/configuracion"
        title="Sedes"
        description="Cada activo, empleado, solicitud y despacho pertenece a una sede. Todos trabajan con todas las sedes: el selector del menú filtra lo que se muestra. Solo se puede eliminar una sede que nada usa."
        actions={
          !abierto && (
            <Button leftIcon={<Plus size={18} />} onClick={() => abrir()}>
              Nueva sede
            </Button>
          )
        }
      />

      <ResumenErrores mensaje={resumen} />
      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {abierto && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">{abierto === "nueva" ? "Nueva sede" : "Editar sede"}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CampoTexto
              label="Código"
              obligatorio={abierto === "nueva"}
              value={form.codigo}
              onChange={(v) => cambiar("codigo", v.toUpperCase())}
              error={errores.codigo}
              placeholder="Ej: STGO, CCP"
              maxLength={12}
              disabled={abierto !== "nueva"}
              ayuda="Código corto y estable: no se puede cambiar después de creada."
            />
            <CampoTexto
              label="Nombre"
              obligatorio
              value={form.nombre}
              onChange={(v) => cambiar("nombre", v)}
              error={errores.nombre}
              placeholder="Ej: Santiago, Concepción"
            />
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
        <TablaDatos
          items={sedes}
          clave={(s) => s.id}
          vacio="No hay sedes registradas"
          resaltada={(s) => abierto === s.id}
          columnas={[
            { titulo: "Código", celda: (s) => <span className="font-mono">{s.codigo}</span>, className: "text-fg-muted" },
            {
              titulo: "Nombre",
              celda: (s) => (
                <div className="flex items-center gap-2 font-medium text-fg">
                  <MapPin size={16} className="text-fg-subtle" />
                  {s.nombre}
                </div>
              ),
            },
            { titulo: "Personas", celda: (s) => s._count.empleados, className: "text-center text-fg-subtle" },
            { titulo: "Equipos", celda: (s) => s._count.assets, className: "text-center text-fg-subtle" },
          ]}
          tarjeta={(s) => (
            <>
              <p className="flex items-center gap-2 font-medium text-fg">
                <MapPin size={14} className="text-fg-subtle" />
                {s.nombre} <span className="font-mono text-xs text-fg-subtle">{s.codigo}</span>
              </p>
              <p className="text-xs text-fg-muted">
                {plural(s._count.empleados, "persona", "personas")} · {plural(s._count.assets, "equipo", "equipos")}
              </p>
            </>
          )}
          acciones={(s) => (
            <>
              <button
                onClick={() => abrir(s)}
                className="rounded p-1 text-primary-700 hover:bg-primary-50"
                title="Editar"
                aria-label={`Editar ${s.nombre}`}
              >
                <Edit size={18} />
              </button>
              {/* Solo una sede sin uso; si la usa algo, el boton dice que (SPEC 2.170). */}
              <button
                onClick={() => setPorEliminar(s)}
                disabled={!!usoSedeEnPalabras(s._count)}
                className="rounded p-1 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                title={usoSedeEnPalabras(s._count) ? `No se puede eliminar: la usan ${usoSedeEnPalabras(s._count)}` : "Eliminar"}
                aria-label={`Eliminar ${s.nombre}`}
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        />
      )}

      <ConfirmDialog
        isOpen={!!porEliminar}
        onClose={() => setPorEliminar(null)}
        onConfirm={async () => {
          if (porEliminar) await ejecutar(() => eliminar(porEliminar));
        }}
        variant="danger"
        icon={Trash2}
        title="Eliminar sede"
        message={porEliminar ? `${porEliminar.nombre} (${porEliminar.codigo}) se elimina. Nada la usa, así que no se pierde ningún dato.` : ""}
        confirmLabel="Eliminar"
      />
    </div>
  );
}
