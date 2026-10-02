"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Edit, Plus, Save, Trash2, Upload } from "lucide-react";
import { ActivosTabs } from "@/modules/activos/componentes";
import { formatearNumero } from "@/modules/lineas";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { formatearFecha } from "@/shared/utilidades/fechas";
import { formatearClp } from "@/shared/utilidades/moneda";
import { coincidePorPalabras } from "@/shared/utilidades/text";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { useEnvio } from "@/shared/hooks/useEnvio";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { ActiveBadge } from "@/shared/ui/Badge";
import { Button } from "@/shared/ui/Button";
import { CampoFormulario, CampoTexto, ResumenErrores, claseInput } from "@/shared/ui/CampoFormulario";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { PageHeader } from "@/shared/ui/PageHeader";
import { TablaAdaptable } from "@/shared/ui/TablaAdaptable";
import { useToast } from "@/shared/ui/Toast";

/**
 * Activos > Lineas (SPEC 2.131). Cada linea es un registro propio que se
 * asocia, si corresponde, a un celular y a una persona. Un solo formulario
 * para crear y editar; dar de baja es cambiar el estado.
 */

type Persona = { id: string; nombres: string; apellidoPaterno: string; rut: string | null };
type Celular = { id: string; marca: string; modelo: string; imei: string | null };
type Linea = {
  id: string;
  numero: string;
  plan: string | null;
  precioMensual: number | null;
  estado: "activa" | "baja";
  fechaBaja: string | null;
  responsable: string | null;
  observaciones: string | null;
  activo: Celular | null;
  empleado: Persona | null;
};

const ETIQUETAS = { numero: "Número", precioMensual: "Precio mensual", activoId: "Celular", empleadoId: "Persona" };
const FORM_INICIAL = {
  numero: "",
  plan: "",
  precioMensual: "",
  estado: "activa",
  activoId: "",
  empleadoId: "",
  responsable: "",
  observaciones: "",
};


const nombrePersona = (p: Persona) => `${p.nombres} ${p.apellidoPaterno}`;
const nombreCelular = (c: Celular) => `${c.marca} ${c.modelo}${c.imei ? ` · IMEI ${c.imei}` : ""}`;

/** Quien tiene la linea: la persona del sistema o el texto del responsable. */
function Tenedor({ l }: { l: Linea }) {
  if (l.empleado) {
    return (
      <Link href={`/empleados/${l.empleado.id}`} className="text-brand hover:underline">
        {nombrePersona(l.empleado)}
      </Link>
    );
  }
  return <span className="text-fg-subtle">{l.responsable ?? "Sin asignar"}</span>;
}

/** Lista desplegable con un buscador encima que acorta las opciones (no distingue tildes). */
function ListaConBuscador({
  label,
  valor,
  onChange,
  opciones,
  vacio,
  buscar,
  error,
}: {
  label: string;
  valor: string;
  onChange: (id: string) => void;
  opciones: { id: string; texto: string }[];
  vacio: string;
  buscar: string;
  error?: string;
}) {
  const id = useId();
  const [filtro, setFiltro] = useState("");
  // La opcion elegida se mantiene aunque no calce con lo escrito.
  const visibles = filtro.trim()
    ? opciones.filter((o) => o.id === valor || coincidePorPalabras(filtro, [o.texto]))
    : opciones;
  return (
    <CampoFormulario label={label} error={error} htmlFor={id} className="lg:col-span-2">
      <input
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder={buscar}
        aria-label={buscar}
        className={claseInput()}
      />
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value)} className={`${claseInput(error)} mt-2`}>
        <option value="">{filtro.trim() ? `${visibles.length} ${visibles.length === 1 ? "encontrado" : "encontrados"} · ${vacio}` : vacio}</option>
        {visibles.map((o) => (
          <option key={o.id} value={o.id}>
            {o.texto}
          </option>
        ))}
      </select>
    </CampoFormulario>
  );
}

export function LineasView() {
  const toast = useToast();
  const puedeEliminar = usePermissions().can("lineas", "delete");
  const { enviando, ejecutar } = useEnvio();
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [opciones, setOpciones] = useState<{ celulares: Celular[]; personas: Persona[] }>({ celulares: [], personas: [] });
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState("activa");
  const [busqueda, setBusqueda] = useState("");
  const q = useDebouncedValue(busqueda);
  // null = cerrado, "nueva" = creando, id = editando esa linea.
  const [abierto, setAbierto] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [error, setError] = useState("");
  const [aEliminar, setAEliminar] = useState<Linea | null>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);

  const cargar = async () => {
    try {
      const res = await fetch(`/api/lineas?${new URLSearchParams({ estado, q })}`);
      if (res.ok) setLineas(await res.json());
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, q]);

  useEffect(() => {
    fetch("/api/lineas/opciones").then(async (r) => r.ok && setOpciones(await r.json()));
  }, []);

  const cambiar = (campo: keyof typeof FORM_INICIAL, valor: string) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    limpiar(campo);
  };

  const abrir = (l?: Linea) => {
    setAbierto(l?.id ?? "nueva");
    setForm(
      l
        ? {
            numero: formatearNumero(l.numero),
            plan: l.plan ?? "",
            precioMensual: l.precioMensual?.toString() ?? "",
            estado: l.estado,
            activoId: l.activo?.id ?? "",
            empleadoId: l.empleado?.id ?? "",
            responsable: l.responsable ?? "",
            observaciones: l.observaciones ?? "",
          }
        : FORM_INICIAL
    );
    setError("");
    reportar({});
  };

  const cerrar = () => {
    setAbierto(null);
    setError("");
    reportar({});
  };

  const guardar = async () => {
    if (reportar(form.numero.trim() ? {} : { numero: "Escribe el número" })) return;
    const nueva = abierto === "nueva";
    const res = await fetch(nueva ? "/api/lineas" : `/api/lineas/${abierto}`, {
      method: nueva ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    if (!res?.ok) {
      const { message, fieldErrors } = res
        ? await parseApiError(res, "Error al guardar la línea")
        : { message: "Error al guardar la línea", fieldErrors: {} };
      if (!reportarServidor(fieldErrors)) setError(message);
      return;
    }
    await cargar();
    cerrar();
    toast.success(nueva ? "Línea creada" : "Línea guardada");
  };

  const eliminar = async (l: Linea) => {
    setAEliminar(null);
    const res = await fetch(`/api/lineas/${l.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error(res ? (await parseApiError(res, "Error al eliminar la línea")).message : "Error al eliminar la línea");
      return;
    }
    await cargar();
    toast.success("Línea eliminada");
  };

  const importar = async (file: File) => {
    const datos = new FormData();
    datos.append("file", file);
    const res = await fetch("/api/lineas/importar", { method: "POST", body: datos }).catch(() => null);
    if (archivo.current) archivo.current.value = "";
    if (!res?.ok) {
      toast.error(res ? (await parseApiError(res, "Error al importar")).message : "Error al importar");
      return;
    }
    const r = await res.json();
    await cargar();
    toast.success(
      `${r.nuevas} líneas nuevas, ${r.completadas} completadas, ${r.conPersona} con persona del sistema` +
        (r.invalidas.length ? `. Números no válidos: ${r.invalidas.join(", ")}` : "")
    );
  };

  const activas = lineas.filter((l) => l.estado === "activa");
  const costo = activas.reduce((s, l) => s + (l.precioMensual ?? 0), 0);
  const sinAsignar = activas.filter((l) => !l.empleado && !l.responsable).length;

  return (
    <div className="space-y-6">
      <ActivosTabs />
      <PageHeader
        title="Líneas telefónicas"
        description="Líneas contratadas, con su plan y costo. Cada una se asocia al celular donde está el chip y a la persona que la usa."
        actions={
          !abierto && (
            <>
              <input
                ref={archivo}
                type="file"
                accept=".xlsx"
                hidden
                onChange={(e) => e.target.files?.[0] && ejecutar(() => importar(e.target.files![0]))}
              />
              <Button variant="outline" loading={enviando} leftIcon={<Upload size={18} />} onClick={() => archivo.current?.click()}>
                Importar Excel
              </Button>
              <Button leftIcon={<Plus size={18} />} onClick={() => abrir()}>
                Nueva línea
              </Button>
            </>
          )
        }
      />

      {abierto && (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">{abierto === "nueva" ? "Nueva línea" : "Editar línea"}</h2>
          <div className="mb-4 empty:hidden">
            <ResumenErrores mensaje={resumen || error} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <CampoTexto label="Número" obligatorio value={form.numero} onChange={(v) => cambiar("numero", v)} error={errores.numero} placeholder="Ej: 9 1234 5678" />
            <CampoTexto label="Plan" value={form.plan} onChange={(v) => cambiar("plan", v)} placeholder="Ej: 2404 Emp. Extra SIM" />
            <CampoTexto label="Precio mensual" type="number" min={0} value={form.precioMensual} onChange={(v) => cambiar("precioMensual", v)} error={errores.precioMensual} />
            <CampoFormulario label="Estado" ayuda={form.estado === "baja" ? "Queda con la fecha de hoy como fecha de baja." : undefined}>
              <select value={form.estado} onChange={(e) => cambiar("estado", e.target.value)} className={claseInput()}>
                <option value="activa">Activa</option>
                <option value="baja">De baja</option>
              </select>
            </CampoFormulario>
            <ListaConBuscador
              label="Celular"
              valor={form.activoId}
              onChange={(v) => cambiar("activoId", v)}
              error={errores.activoId}
              vacio="Sin celular"
              buscar="Buscar por marca, modelo o IMEI"
              opciones={opciones.celulares.map((c) => ({ id: c.id, texto: nombreCelular(c) }))}
            />
            <ListaConBuscador
              label="Persona"
              valor={form.empleadoId}
              onChange={(v) => cambiar("empleadoId", v)}
              error={errores.empleadoId}
              vacio="Sin persona"
              buscar="Buscar por nombre o RUT"
              opciones={opciones.personas.map((p) => ({ id: p.id, texto: nombrePersona(p) + (p.rut ? ` · ${p.rut}` : "") }))}
            />
            <CampoTexto
              label="Responsable o ubicación"
              className="lg:col-span-2"
              value={form.responsable}
              onChange={(v) => cambiar("responsable", v)}
              placeholder="Ej: Bodega Concepción"
              ayuda="Cuando no la tiene una persona del sistema."
            />
            <CampoFormulario label="Observaciones" className="lg:col-span-2">
              <textarea rows={2} value={form.observaciones} onChange={(e) => cambiar("observaciones", e.target.value)} className={claseInput()} />
            </CampoFormulario>
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

      <div className="flex flex-wrap items-center gap-3">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="field-input w-auto" aria-label="Estado">
          <option value="activa">Activas</option>
          <option value="baja">De baja</option>
          <option value="">Todas</option>
        </select>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por número, persona, plan o celular"
          className="field-input w-full sm:max-w-sm"
          aria-label="Buscar"
        />
        {activas.length > 0 && (
          <p className="text-sm text-fg-muted">
            {activas.length} {activas.length === 1 ? "activa" : "activas"} · {formatearClp(costo)} al mes{sinAsignar > 0 && ` · ${sinAsignar} sin asignar`}
          </p>
        )}
      </div>

      {cargando ? (
        <p className="card px-6 py-8 text-center text-fg-subtle">Cargando...</p>
      ) : (
        <TablaAdaptable
          items={lineas}
          clave={(l) => l.id}
          vacio="No hay líneas con este filtro"
          resaltada={(l) => l.estado === "baja" || abierto === l.id}
          columnas={[
            { titulo: "Número", celda: (l) => <span className="font-mono text-fg">{formatearNumero(l.numero)}</span> },
            {
              titulo: "Plan",
              celda: (l) => (
                <>
                  {l.plan ?? "—"}
                  {l.precioMensual != null && <span className="block text-xs text-fg-subtle">{formatearClp(l.precioMensual)} al mes</span>}
                </>
              ),
            },
            { titulo: "Persona o responsable", celda: (l) => <Tenedor l={l} /> },
            {
              titulo: "Celular",
              celda: (l) =>
                l.activo ? (
                  <Link href={`/activos/${l.activo.id}`} className="text-brand hover:underline">
                    {l.activo.marca} {l.activo.modelo}
                  </Link>
                ) : (
                  <span className="text-fg-subtle">—</span>
                ),
            },
            {
              titulo: "Estado",
              className: "text-center",
              celda: (l) => (
                <>
                  <ActiveBadge activo={l.estado === "activa"} labels={["Activa", "De baja"]} />
                  {l.fechaBaja && <span className="block text-xs text-fg-subtle">{formatearFecha(l.fechaBaja)}</span>}
                </>
              ),
            },
          ]}
          tarjeta={(l) => (
            <>
              <p className="font-mono font-medium text-fg">{formatearNumero(l.numero)}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                <ActiveBadge activo={l.estado === "activa"} labels={["Activa", "De baja"]} />
                <Tenedor l={l} />
                {l.plan && <span>· {l.plan}</span>}
              </div>
            </>
          )}
          acciones={(l) => (
            <>
              <button onClick={() => abrir(l)} className="rounded p-1 text-primary-700 hover:bg-primary-50" title="Editar" aria-label={`Editar ${l.numero}`}>
                <Edit size={18} />
              </button>
              {puedeEliminar && (
                <button onClick={() => setAEliminar(l)} className="rounded p-1 text-red-600 hover:bg-red-50" title="Eliminar" aria-label={`Eliminar ${l.numero}`}>
                  <Trash2 size={18} />
                </button>
              )}
            </>
          )}
        />
      )}

      <ConfirmDialog
        isOpen={!!aEliminar}
        onClose={() => setAEliminar(null)}
        onConfirm={async () => {
          if (aEliminar) await ejecutar(() => eliminar(aEliminar));
        }}
        variant="danger"
        title="Eliminar línea"
        message={
          aEliminar
            ? `La línea ${formatearNumero(aEliminar.numero)} se borrará. Úsalo solo si se ingresó por error; si ya no se usa, dala de baja. En la auditoría quedará quién la eliminó.`
            : ""
        }
        confirmLabel="Eliminar"
      />
    </div>
  );
}
