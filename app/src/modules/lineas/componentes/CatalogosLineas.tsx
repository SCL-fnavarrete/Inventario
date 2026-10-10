"use client";

import { useCallback, useEffect, useState } from "react";
import { Edit, Plus, Save, Trash2 } from "lucide-react";
import { ActivosTabs } from "@/modules/activos/componentes";
import { DESCRIPCION_ESTADO, type CatalogoLinea } from "@/modules/lineas";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { useEnvio } from "@/shared/hooks/useEnvio";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { ActiveBadge, Badge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { CampoTexto, ResumenErrores } from "@/shared/ui/CampoFormulario";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { PageHeader } from "@/shared/ui/PageHeader";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import { Tabs } from "@/shared/ui/Tabs";
import { useToast } from "@/shared/ui/Toast";

/**
 * Activos > Lineas > Catalogos (SPEC 2.131): tipos de chip, operadores y motivos,
 * que administran todos (una opcion usada se desactiva en vez de borrarse), y
 * los estados, que son dos y fijos: solo se ven, con lo que significa cada uno.
 */

type Opcion = {
  id: string;
  nombre: string;
  activo: boolean;
  sinCelular?: boolean;
  protegido: boolean;
  enUso: number;
};
type Estado = { id: string; nombre: string; deBaja: boolean; clave: string | null; enUso: number };

const PESTAÑAS: { key: CatalogoLinea; label: string; placeholder: string }[] = [
  { key: "estados", label: "Estados", placeholder: "" },
  { key: "tipos-chip", label: "Tipos de chip", placeholder: "Ej: Físico" },
  { key: "operadores", label: "Operadores", placeholder: "Ej: Entel" },
  { key: "motivos", label: "Motivos de reasignación", placeholder: "Ej: Cambio de equipo" },
  { key: "motivos-baja", label: "Motivos de baja", placeholder: "Ej: Se canceló el servicio" },
];
const FORM_INICIAL = { nombre: "", sinCelular: false };
const lineas = (n: number) => `${n} línea${n === 1 ? "" : "s"}`;
const reasignaciones = (n: number) => `${n} reasignación${n === 1 ? "" : "es"}`;

export function CatalogosLineas() {
  const [catalogo, setCatalogo] = useState<CatalogoLinea>("tipos-chip");
  const fijos = catalogo === "estados";
  return (
    <div className="space-y-6">
      <ActivosTabs />
      <PageHeader
        backHref="/activos/lineas"
        title="Catálogos de líneas"
        description="Opciones que se eligen en una línea, al reasignarla o al darla de baja. Los tipos de chip, operadores y motivos se pueden agregar y renombrar (cambia también donde se usan; uno ya usado se desactiva en vez de eliminarse). Los estados son fijos."
      />
      <Tabs items={PESTAÑAS} value={catalogo} onChange={setCatalogo} />
      {fijos ? <EstadosFijos /> : <Catalogo key={catalogo} catalogo={catalogo} placeholder={PESTAÑAS.find((p) => p.key === catalogo)!.placeholder} />}
    </div>
  );
}

function Catalogo({ catalogo, placeholder }: { catalogo: CatalogoLinea; placeholder: string }) {
  const toast = useToast();
  const { enviando, ejecutar } = useEnvio();
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  // null = cerrado, "nueva" = creando, id = editando.
  const [abierto, setAbierto] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [error, setError] = useState("");
  const [aEliminar, setAEliminar] = useState<Opcion | null>(null);
  const { errores, resumen, reportar, reportarServidor } = useErroresFormulario({ nombre: "Nombre" });
  const url = `/api/lineas/catalogos/${catalogo}`;
  // Un motivo se cuenta en reasignaciones; los demas, en lineas.
  const motivos = catalogo === "motivos";
  const unidad = motivos ? reasignaciones : lineas;

  const cargar = useCallback(
    () => fetch(`${url}?conUso=true`).then(async (res) => res.ok && setOpciones(await res.json())),
    [url]
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const abrir = (o?: Opcion) => {
    setAbierto(o?.id ?? "nueva");
    setForm(o ? { nombre: o.nombre, sinCelular: !!o.sinCelular } : FORM_INICIAL);
    setError("");
    reportar({});
  };

  const guardar = async () => {
    if (reportar(form.nombre.trim() ? {} : { nombre: "Escribe el nombre" })) return;
    const nueva = abierto === "nueva";
    const res = await fetch(nueva ? url : `${url}/${abierto}`, {
      method: nueva ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: form.nombre,
        ...(catalogo === "tipos-chip" && { sinCelular: form.sinCelular }),
      }),
    }).catch(() => null);
    if (!res?.ok) {
      const { message, fieldErrors } = res ? await parseApiError(res, "Error al guardar") : { message: "Error al guardar", fieldErrors: {} };
      if (!reportarServidor(fieldErrors)) setError(message);
      return;
    }
    await cargar();
    setAbierto(null);
    toast.success(nueva ? "Opción creada" : "Opción guardada");
  };

  const eliminar = async (o: Opcion) => {
    setAEliminar(null);
    const res = await fetch(`${url}/${o.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error(res ? (await parseApiError(res, "Error al eliminar")).message : "Error al eliminar");
      return;
    }
    await cargar();
    toast.success((await res.json()).desactivado ? `Opción desactivada: ya tiene ${motivos ? "reasignaciones" : "líneas"}` : "Opción eliminada");
  };

  return (
    <div className="space-y-4">
      {!abierto && (
        <div className="flex justify-end">
          <Button leftIcon={<Plus size={18} />} onClick={() => abrir()}>
            Nueva opción
          </Button>
        </div>
      )}

      {abierto && (
        <div className="card p-6">
          <div className="mb-4 empty:hidden">
            <ResumenErrores mensaje={resumen || error} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CampoTexto label="Nombre" obligatorio value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} error={errores.nombre} placeholder={placeholder} />
            {catalogo === "tipos-chip" && (
              <label className="flex items-start gap-2 text-sm text-fg md:col-span-2">
                <input type="checkbox" className="mt-1" checked={form.sinCelular} onChange={(e) => setForm({ ...form, sinCelular: e.target.checked })} />
                <span>
                  Va sin celular de la empresa (como una eSIM)
                  <span className="block text-xs text-fg-subtle">Una línea con este tipo de chip no se asocia a un celular de la empresa: se asigna a una persona.</span>
                </span>
              </label>
            )}
          </div>
          <div className="mt-4 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAbierto(null)}>
              Cancelar
            </Button>
            <Button loading={enviando} leftIcon={<Save size={18} />} onClick={() => ejecutar(guardar)}>
              Guardar
            </Button>
          </div>
        </div>
      )}

      <TablaDatos
        items={opciones}
        clave={(o) => o.id}
        vacio="No hay opciones"
        resaltada={(o) => !o.activo || abierto === o.id}
        columnas={[
          { titulo: "Nombre", celda: (o) => <span className="font-medium text-fg">{o.nombre}</span> },
          ...(catalogo === "tipos-chip" ? [{ titulo: "Sin celular", celda: (o: Opcion) => (o.sinCelular ? "Sí" : "—"), className: "text-center" }] : []),
          { titulo: motivos ? "Reasignaciones" : "Líneas", celda: (o) => o.enUso, className: "text-center text-fg-subtle" },
          { titulo: "Estado", celda: (o) => <ActiveBadge activo={o.activo} labels={["Activa", "Desactivada"]} />, className: "text-center" },
        ]}
        tarjeta={(o) => (
          <>
            <p className="font-medium text-fg">{o.nombre}</p>
            <p className="text-xs text-fg-muted">
              {unidad(o.enUso)}
              {!o.activo && " · desactivada"}
            </p>
          </>
        )}
        acciones={(o) => (
          <>
            <button onClick={() => abrir(o)} className="rounded p-1 text-primary-700 hover:bg-primary-50" title="Editar" aria-label={`Editar ${o.nombre}`}>
              <Edit size={18} />
            </button>
            {!o.protegido && o.activo && (
              <button onClick={() => setAEliminar(o)} className="rounded p-1 text-red-600 hover:bg-red-50" title="Eliminar" aria-label={`Eliminar ${o.nombre}`}>
                <Trash2 size={18} />
              </button>
            )}
          </>
        )}
      />

      <ConfirmDialog
        isOpen={!!aEliminar}
        onClose={() => setAEliminar(null)}
        onConfirm={async () => {
          if (aEliminar) await ejecutar(() => eliminar(aEliminar));
        }}
        variant="danger"
        title="Eliminar opción"
        message={
          !aEliminar
            ? ""
            : aEliminar.enUso > 0
              ? `"${aEliminar.nombre}" está en ${unidad(aEliminar.enUso)}. Se desactivará: deja de ofrecerse y se conserva donde ya se usó.`
              : `¿Eliminar "${aEliminar.nombre}"?`
        }
        confirmLabel="Eliminar"
      />
    </div>
  );
}

/** Los estados de una linea: dos y fijos. Solo se ven, con lo que significa cada uno. */
function EstadosFijos() {
  const [estados, setEstados] = useState<Estado[]>([]);

  useEffect(() => {
    fetch("/api/lineas/catalogos/estados?conUso=true").then(async (r) => r.ok && setEstados(await r.json()));
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-subtle">
        Los estados son los del ciclo de vida de una línea y no se agregan ni se cambian. Para pasar una línea de un estado a otro, edítala y elige el nuevo estado.
      </p>
      <TablaDatos
        items={estados}
        clave={(e) => e.id}
        vacio="No hay estados"
        columnas={[
          { titulo: "Estado", celda: (e) => <span className="font-medium text-fg">{e.nombre}</span> },
          {
            titulo: "Cuenta en el costo",
            celda: (e) => (e.deBaja ? <Badge variant="neutral">No: es una baja</Badge> : <Badge variant="success">Sí</Badge>),
          },
          { titulo: "Qué significa", celda: (e) => <span className="text-fg-muted">{DESCRIPCION_ESTADO[e.clave ?? ""] ?? ""}</span> },
          { titulo: "Líneas", celda: (e) => e.enUso, className: "text-center text-fg-subtle" },
        ]}
        tarjeta={(e) => (
          <>
            <p className="font-medium text-fg">{e.nombre}</p>
            <p className="text-xs text-fg-muted">{DESCRIPCION_ESTADO[e.clave ?? ""]}</p>
            <p className="text-xs text-fg-subtle">{lineas(e.enUso)}</p>
          </>
        )}
      />
    </div>
  );
}
