"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Save, MapPin, Power, PowerOff } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ActiveBadge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { TablaAdaptable } from "@/components/ui/TablaAdaptable";
import { CampoTexto, ResumenErrores } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { useEnvio } from "@/hooks/useEnvio";

/**
 * Configuracion > Sedes. Un solo formulario para crear y editar (antes el
 * nombre se editaba dentro de la fila, que en celular no cabia) y la lista
 * adaptable (SPEC 2.112.9). Desactivar pide confirmacion y dice que tiene
 * la sede (SPEC 2.112.6).
 */

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  // Tecnicos activos y equipos vigentes, para avisar antes de desactivar.
  _count?: { usuarios: number; assets: number };
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
  // Sede que se va a activar/desactivar, a la espera de confirmar.
  const [cambioEstado, setCambioEstado] = useState<Sede | null>(null);
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

  const cambiarEstado = async (sede: Sede) => {
    setCambioEstado(null);
    try {
      const res = await fetch(`/api/sedes/${sede.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !sede.activa }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al cambiar el estado de la sede");
        setError(message);
        setFieldErrors(fe);
        return;
      }
      await cargar();
      toast.success(`Sede ${sede.activa ? "desactivada" : "activada"}`);
    } catch {
      setError("Error al cambiar el estado de la sede");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/configuracion"
        title="Sedes"
        description="Cada activo, empleado, solicitud y despacho pertenece a una sede. El técnico trabaja solo con los datos de la suya; el administrador ve todas y el selector del menú filtra lo que muestra. Si una sede se desactiva, sus técnicos no pueden entrar."
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
        <TablaAdaptable
          items={sedes}
          clave={(s) => s.id}
          vacio="No hay sedes registradas"
          resaltada={(s) => !s.activa || abierto === s.id}
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
            {
              titulo: "Técnicos",
              celda: (s) => s._count?.usuarios ?? 0,
              className: "text-center text-fg-subtle",
            },
            { titulo: "Equipos", celda: (s) => s._count?.assets ?? 0, className: "text-center text-fg-subtle" },
            {
              titulo: "Estado",
              celda: (s) => <ActiveBadge activo={s.activa} labels={["Activa", "Inactiva"]} />,
              className: "text-center",
            },
          ]}
          tarjeta={(s) => (
            <>
              <p className="flex items-center gap-2 font-medium text-fg">
                <MapPin size={14} className="text-fg-subtle" />
                {s.nombre} <span className="font-mono text-xs text-fg-subtle">{s.codigo}</span>
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <ActiveBadge activo={s.activa} labels={["Activa", "Inactiva"]} />
                {plural(s._count?.usuarios ?? 0, "técnico", "técnicos")} · {plural(s._count?.assets ?? 0, "equipo", "equipos")}
              </div>
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
              {/* Activar/desactivar con confirmacion (SPEC 2.112.6). */}
              <button
                onClick={() => setCambioEstado(s)}
                className={
                  s.activa ? "rounded p-1 text-red-600 hover:bg-red-50" : "rounded p-1 text-green-600 hover:bg-green-50"
                }
                title={s.activa ? "Desactivar" : "Activar"}
                aria-label={`${s.activa ? "Desactivar" : "Activar"} ${s.nombre}`}
              >
                {s.activa ? <PowerOff size={18} /> : <Power size={18} />}
              </button>
            </>
          )}
        />
      )}

      <ConfirmDialog
        isOpen={!!cambioEstado}
        onClose={() => setCambioEstado(null)}
        onConfirm={async () => {
          if (cambioEstado) await ejecutar(() => cambiarEstado(cambioEstado));
        }}
        variant={cambioEstado?.activa ? "danger" : "info"}
        icon={cambioEstado?.activa ? PowerOff : Power}
        title={cambioEstado?.activa ? "Desactivar sede" : "Activar sede"}
        message={
          !cambioEstado
            ? ""
            : cambioEstado.activa
              ? `${cambioEstado.nombre} tiene ${plural(cambioEstado._count?.usuarios ?? 0, "técnico activo", "técnicos activos")} y ${plural(cambioEstado._count?.assets ?? 0, "equipo", "equipos")}. Sus técnicos no podrán iniciar sesión, y los que estén dentro saldrán en su siguiente acción, hasta que los cambies de sede o la reactives. No se podrán asignar usuarios nuevos a esta sede. Los equipos y datos no se tocan.`
              : `${cambioEstado.nombre} vuelve a estar disponible y sus técnicos podrán iniciar sesión.`
        }
        confirmLabel={cambioEstado?.activa ? "Desactivar" : "Activar"}
      />
    </div>
  );
}
