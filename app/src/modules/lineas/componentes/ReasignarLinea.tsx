"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Repeat } from "lucide-react";
import { destinosPermitidos, errorDeAsociacion, formatearNumero, type DestinoLinea } from "@/modules/lineas";
import { ListaConBuscador } from "@/modules/lineas/componentes/ListaConBuscador";
import {
  OPCIONES_VACIAS,
  nombreCelular,
  nombrePersona,
  personaDe,
  sedeDe,
  type LineaLista,
  type OpcionesLinea,
} from "@/modules/lineas/componentes/tipos";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { hoyISO } from "@/shared/utilidades/fechas";
import { useEnvio } from "@/shared/hooks/useEnvio";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { Button } from "@/shared/ui/Button";
import { CampoFormulario, CampoTexto, ResumenErrores, claseInput } from "@/shared/ui/CampoFormulario";
import { CatalogSelect } from "@/shared/ui/CatalogSelect";
import { useToast } from "@/shared/ui/Toast";

/**
 * Asignar una linea disponible (SPEC 2.131): solo una sin persona. Segun su tipo
 * de chip, un chip fisico va a un celular sin asignar (la persona la recibe
 * cuando una solicitud le entrega ese celular) y una eSIM a una persona activa;
 * tambien puede quedar sin asignar (sacar el chip). Una linea
 * asignada cambia de persona con las solicitudes. Queda anotado, con la fecha,
 * el motivo y quien lo hizo.
 */

type Destino = DestinoLinea;

const ETIQUETAS = { destino: "Destino", activoId: "Teléfono", empleadoId: "Persona", desde: "Desde cuándo", motivoId: "Motivo" };

const DESTINOS: { valor: Destino; titulo: string; ayuda: string }[] = [
  { valor: "telefono", titulo: "A un celular sin asignar", ayuda: "Un celular de bodega. La persona recibe la línea cuando una solicitud le entrega ese celular." },
  { valor: "persona", titulo: "A una persona", ayuda: "Con su eSIM, en su teléfono personal." },
  { valor: "ninguno", titulo: "Sin asignar", ayuda: "Se saca el chip: queda disponible, por ejemplo en una bodega." },
];

/** Donde esta la linea hoy, en una frase. */
function dondeEsta(l: Pick<LineaLista, "activo" | "empleado">) {
  const persona = personaDe(l);
  const nombreSede = sedeDe(l);
  const sede = nombreSede ? ` · Sede ${nombreSede}` : "";
  if (l.activo) {
    return `En ${l.activo.marca} ${l.activo.modelo} · ${persona ? `la usa ${nombrePersona(persona)}` : "sin persona"}${sede}`;
  }
  if (persona) return `Con ${nombrePersona(persona)} (teléfono personal o eSIM)${sede}`;
  return "Sin asignar";
}

export function ReasignarLinea({ linea, onCerrar }: { linea: LineaLista; onCerrar: (guardada: boolean) => void }) {
  const toast = useToast();
  const { enviando, ejecutar } = useEnvio();
  const [opciones, setOpciones] = useState<OpcionesLinea>(OPCIONES_VACIAS);
  // Fisico -> telefono de la empresa; eSIM -> persona; sin tipo de chip, solo sin asignar.
  const permitidos = destinosPermitidos(linea.tipoChip);
  const [destino, setDestino] = useState<Destino>(permitidos[0]);
  const [activoId, setActivoId] = useState("");
  const [empleadoId, setEmpleadoId] = useState("");
  const [desde, setDesde] = useState(hoyISO());
  const [motivoId, setMotivoId] = useState("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState("");
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);
  const ref = useRef<HTMLDivElement>(null);
  const idForm = useId();

  useEffect(() => {
    fetch("/api/lineas/opciones").then(async (r) => r.ok && setOpciones(await r.json()));
  }, []);

  // Si el formulario no se ve, la pantalla va hasta el.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { top } = el.getBoundingClientRect();
    if (top < 80 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const elegirDestino = (d: Destino) => {
    setDestino(d);
    setError("");
    limpiar("destino", "activoId", "empleadoId");
  };

  const guardar = async () => {
    const faltan: Record<string, string> = {};
    if (destino === "telefono" && !activoId) faltan.activoId = "Elige el teléfono";
    if (destino === "persona" && !empleadoId) faltan.empleadoId = "Elige la persona";
    if (reportar(faltan)) return;
    const res = await fetch(`/api/lineas/${linea.id}/reasignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destino, activoId, empleadoId, desde, motivoId, detalle }),
    }).catch(() => null);
    if (!res?.ok) {
      const { message, fieldErrors } = res ? await parseApiError(res, "Error al asignar la línea") : { message: "Error al asignar la línea", fieldErrors: {} };
      if (!reportarServidor(fieldErrors)) setError(message);
      return;
    }
    toast.success("Línea asignada");
    onCerrar(true);
  };

  // Como quedaria la linea.
  const celularElegido = opciones.celulares.find((c) => c.id === activoId);
  const personaElegida = opciones.personas.find((p) => p.id === empleadoId);
  const despues =
    destino === "telefono"
      ? celularElegido
        ? `En ${celularElegido.marca} ${celularElegido.modelo} · ${celularElegido.empleadoActual ? `la usará ${nombrePersona(celularElegido.empleadoActual)}` : "sin persona (el teléfono está libre)"}`
        : "—"
      : destino === "persona"
        ? personaElegida
          ? `Con ${nombrePersona(personaElegida)} (teléfono personal o eSIM)`
          : "—"
        : "Sin asignar";

  return (
    <div ref={ref} className="card scroll-mt-24 p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-fg">
        <Repeat size={20} className="text-fg-subtle" /> Asignar la línea {formatearNumero(linea.numero)}
      </h2>
      <div className="mb-4 empty:hidden">
        <ResumenErrores mensaje={resumen || error} />
      </div>

      <div className="mb-4 grid grid-cols-1 items-center gap-3 rounded-control bg-surface-muted p-4 md:grid-cols-[1fr_auto_1fr]">
        <div>
          <p className="text-xs uppercase text-fg-subtle">Ahora</p>
          <p className="text-sm text-fg">{dondeEsta(linea)}</p>
        </div>
        <ArrowRight size={18} className="hidden text-fg-subtle md:block" />
        <div>
          <p className="text-xs uppercase text-fg-subtle">Después</p>
          <p className="text-sm text-fg">{despues}</p>
        </div>
      </div>

      <fieldset className="mb-4">
        <legend className="field-label">¿A dónde va la línea?</legend>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {DESTINOS.map((d) => {
            const bloqueado = !permitidos.includes(d.valor);
            return (
              <label
                key={d.valor}
                className={`rounded-control border p-3 text-sm ${bloqueado ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${destino === d.valor ? "border-primary-600 bg-primary-50 dark:bg-primary-950/30" : "border-line"}`}
              >
                <input
                  type="radio"
                  name={`${idForm}-destino`}
                  className="mr-2"
                  checked={destino === d.valor}
                  disabled={bloqueado}
                  onChange={() => elegirDestino(d.valor)}
                />
                <span className="font-medium text-fg">{d.titulo}</span>
                <span className="block pl-5 text-xs text-fg-subtle">{bloqueado ? errorDeAsociacion(linea.tipoChip, d.valor) : d.ayuda}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {destino === "telefono" && (
          <ListaConBuscador
            label="Teléfono de la empresa"
            valor={activoId}
            onChange={(v) => {
              setActivoId(v);
              limpiar("activoId");
            }}
            error={errores.activoId}
            vacio="Elige un teléfono"
            buscar="Buscar por marca, modelo o IMEI"
            opciones={opciones.celulares.map((c) => ({ id: c.id, texto: nombreCelular(c) }))}
          />
        )}
        {destino === "persona" && (
          <ListaConBuscador
            label="Persona"
            valor={empleadoId}
            onChange={(v) => {
              setEmpleadoId(v);
              limpiar("empleadoId");
            }}
            error={errores.empleadoId}
            vacio="Elige una persona"
            buscar="Buscar por nombre o RUT"
            opciones={opciones.personas.map((p) => ({ id: p.id, texto: nombrePersona(p) + (p.rut ? ` · ${p.rut}` : "") }))}
          />
        )}
        <CampoTexto
          label="Desde cuándo"
          type="date"
          max={hoyISO()}
          value={desde}
          onChange={(v) => {
            setDesde(v);
            limpiar("desde");
          }}
          error={errores.desde}
        />
        <CampoFormulario label="Motivo" error={errores.motivoId} htmlFor={`${idForm}-motivo`}>
          <CatalogSelect
            id={`${idForm}-motivo`}
            endpoint="/api/lineas/catalogos/motivos"
            usarId
            value={motivoId}
            onChange={(v) => {
              setMotivoId(v);
              limpiar("motivoId");
            }}
            placeholder="Sin motivo"
            invalido={!!errores.motivoId}
          />
        </CampoFormulario>
        <CampoFormulario label="Detalle (opcional)" className="md:col-span-2">
          <textarea rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)} className={claseInput()} maxLength={500} />
        </CampoFormulario>
      </div>

      <p className="mt-3 text-xs text-fg-subtle">Solo se asignan líneas disponibles. Una línea asignada cambia de persona con las solicitudes: al entregar, cambiar o devolver su celular; una eSIM se libera con la devolución por término.</p>
      <div className="mt-4 flex justify-end gap-3">
        <Button variant="outline" onClick={() => onCerrar(false)}>
          Cancelar
        </Button>
        <Button loading={enviando} leftIcon={<Repeat size={18} />} onClick={() => ejecutar(guardar)}>
          Asignar
        </Button>
      </div>
    </div>
  );
}
