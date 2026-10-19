"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Repeat } from "lucide-react";
import { formatearNumero, type DestinoLinea } from "@/modules/lineas";
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
import { useEnvio } from "@/shared/hooks/useEnvio";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { Button } from "@/shared/ui/Button";
import { CampoFormulario, ResumenErrores, claseInput } from "@/shared/ui/CampoFormulario";
import { CatalogSelect } from "@/shared/ui/CatalogSelect";
import { useToast } from "@/shared/ui/Toast";

/**
 * Acciones de una linea disponible (SPEC 2.131, 2.167), escritas para que se
 * entienda que hace cada una: asignarla o moverla a un telefono sin linea,
 * asignar una eSIM a una persona, sacar el chip o cambiar su tipo (eSIM <-> chip
 * fisico) con el mismo numero. Una linea que usa una persona no se toca aqui:
 * cambia con las solicitudes. Queda anotado con el motivo y quien lo hizo.
 */

export type ClaveAccion = "telefono" | "persona" | "sacar" | "aEsim" | "aFisico";
export type AccionLinea = { clave: ClaveAccion; titulo: string; ayuda: string };

type LineaAcciones = Pick<LineaLista, "activo" | "empleado" | "tipoChip" | "estado">;

/** Lo que se puede hacer con la linea hoy. Vacio si es de baja, la usa una persona o no tiene tipo de chip. */
export function accionesDeLinea(l: LineaAcciones): AccionLinea[] {
  if (l.estado.deBaja || personaDe(l) || !l.tipoChip) return [];
  if (l.tipoChip.sinCelular) {
    return [
      { clave: "persona", titulo: "Asignar a una persona", ayuda: "La persona usa la eSIM en su teléfono personal." },
      { clave: "aFisico", titulo: "Cambiar a chip físico", ayuda: "Mismo número, ahora con chip. Si quieres, eliges en el mismo paso el teléfono sin línea donde va." },
    ];
  }
  const enTelefono = !!l.activo;
  return [
    enTelefono
      ? { clave: "telefono", titulo: "Mover a otro teléfono", ayuda: "El chip pasa a otro celular de la empresa que no tenga línea. Si ese teléfono lo tiene alguien, esa persona pasa a usar la línea." }
      : { clave: "telefono", titulo: "Asignar a un teléfono sin línea", ayuda: "El chip va a un celular de la empresa sin línea. Si ese teléfono lo tiene alguien, esa persona pasa a usar la línea." },
    { clave: "aEsim", titulo: "Cambiar a eSIM", ayuda: `Mismo número, ahora como eSIM${enTelefono ? " (sale del teléfono)" : ""}. Si quieres, eliges en el mismo paso la persona que la usará.` },
    ...(enTelefono ? [{ clave: "sacar" as const, titulo: "Sacar el chip", ayuda: "La línea sale del teléfono y queda disponible para asignarla después." }] : []),
  ];
}

/** A donde va la linea segun la accion y lo elegido (al cambiar el tipo, el destino es opcional). */
export function destinoDeAccion(clave: ClaveAccion, elegido: { activoId: string; empleadoId: string }): DestinoLinea {
  if (clave === "telefono" || (clave === "aFisico" && elegido.activoId)) return "telefono";
  if (clave === "persona" || (clave === "aEsim" && elegido.empleadoId)) return "persona";
  return "ninguno";
}

const ETIQUETAS = { destino: "Destino", activoId: "Teléfono", empleadoId: "Persona", tipoChipId: "Tipo de chip", motivoId: "Motivo" };

/** Donde esta la linea hoy, en una frase. */
function dondeEsta(l: Pick<LineaLista, "activo" | "empleado" | "sede">) {
  const persona = personaDe(l);
  const nombreSede = sedeDe(l);
  const sede = nombreSede ? ` · Sede ${nombreSede}` : "";
  if (l.activo) {
    return `En ${l.activo.marca.nombre} ${l.activo.modelo} · ${persona ? `la usa ${nombrePersona(persona)}` : "sin persona"}${sede}`;
  }
  if (persona) return `Con ${nombrePersona(persona)} (teléfono personal o eSIM)${sede}`;
  return `Disponible${sede}`;
}

export function ReasignarLinea({ linea, accion, onCerrar }: { linea: LineaLista; accion: AccionLinea; onCerrar: (guardada: boolean) => void }) {
  const toast = useToast();
  const { enviando, ejecutar } = useEnvio();
  const [opciones, setOpciones] = useState<OpcionesLinea>(OPCIONES_VACIAS);
  const [activoId, setActivoId] = useState("");
  const [empleadoId, setEmpleadoId] = useState("");
  const [tipoElegidoId, setTipoChipId] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [error, setError] = useState("");
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);
  const ref = useRef<HTMLDivElement>(null);
  const idForm = useId();

  const { clave } = accion;
  const cambiaTipo = clave === "aEsim" || clave === "aFisico";
  // Los tipos de chip a los que puede pasar: eSIM o fisicos. Si hay uno solo, no se pregunta.
  const tipos = opciones.tiposChip.filter((t) => t.sinCelular === (clave === "aEsim"));
  const tipoChipId = cambiaTipo ? tipoElegidoId || tipos[0]?.id || "" : "";
  const pideTelefono = clave === "telefono" || clave === "aFisico";
  const pidePersona = clave === "persona" || clave === "aEsim";

  useEffect(() => {
    const fallo = () => setError("No se pudieron cargar los teléfonos y personas. Recarga la página.");
    fetch("/api/lineas/opciones")
      .then(async (r) => (r.ok ? setOpciones(await r.json()) : fallo()))
      .catch(fallo);
  }, []);

  // Si el formulario no se ve, la pantalla va hasta el.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { top } = el.getBoundingClientRect();
    if (top < 80 || top > window.innerHeight * 0.6) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const destino = destinoDeAccion(clave, { activoId, empleadoId });

  const guardar = async () => {
    const faltan: Record<string, string> = {};
    if (clave === "telefono" && !activoId) faltan.activoId = "Elige el teléfono";
    if (clave === "persona" && !empleadoId) faltan.empleadoId = "Elige la persona";
    if (cambiaTipo && !tipoChipId) faltan.tipoChipId = `No hay un tipo de chip ${clave === "aEsim" ? "eSIM" : "físico"} activo: créalo en Catálogos`;
    if (reportar(faltan)) return;
    const res = await fetch(`/api/lineas/${linea.id}/reasignar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destino, activoId, empleadoId, tipoChipId, motivoId }),
    }).catch(() => null);
    if (!res?.ok) {
      const { message, fieldErrors } = res ? await parseApiError(res, "Error al guardar la línea") : { message: "Error al guardar la línea", fieldErrors: {} };
      if (!reportarServidor(fieldErrors)) setError(message);
      return;
    }
    toast.success("Línea actualizada");
    onCerrar(true);
  };

  // Como quedaria la linea.
  const celularElegido = opciones.celulares.find((c) => c.id === activoId);
  const personaElegida = opciones.personas.find((p) => p.id === empleadoId);
  const tipoElegido = cambiaTipo ? opciones.tiposChip.find((t) => t.id === tipoChipId)?.nombre : null;
  const lugar =
    destino === "telefono"
      ? celularElegido
        ? `En ${celularElegido.marca.nombre} ${celularElegido.modelo} · ${celularElegido.empleadoActual ? `la usará ${nombrePersona(celularElegido.empleadoActual)}` : "sin persona"}`
        : "—"
      : destino === "persona"
        ? personaElegida
          ? `Con ${nombrePersona(personaElegida)} (teléfono personal)`
          : "—"
        : "Disponible";
  const despues = tipoElegido ? `${tipoElegido} · ${lugar}` : lugar;

  return (
    <div ref={ref} className="card scroll-mt-24 p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-fg">
        <Repeat size={20} className="text-fg-subtle" /> {accion.titulo}: {formatearNumero(linea.numero)}
      </h2>
      <p className="mb-4 text-sm text-fg-subtle">{accion.ayuda}</p>
      <div className="mb-4 empty:hidden">
        <ResumenErrores mensaje={resumen || error} />
      </div>

      <div className="mb-4 grid grid-cols-1 items-center gap-3 rounded-control bg-surface-muted p-4 md:grid-cols-[1fr_auto_1fr]">
        <div>
          <p className="text-xs uppercase text-fg-subtle">Ahora</p>
          <p className="text-sm text-fg">{[linea.tipoChip?.nombre, dondeEsta(linea)].filter(Boolean).join(" · ")}</p>
        </div>
        <ArrowRight size={18} className="hidden text-fg-subtle md:block" />
        <div>
          <p className="text-xs uppercase text-fg-subtle">Después</p>
          <p className="text-sm text-fg">{despues}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cambiaTipo && tipos.length > 1 && (
          <CampoFormulario label="Tipo de chip" error={errores.tipoChipId} htmlFor={`${idForm}-tipo`}>
            <select
              id={`${idForm}-tipo`}
              value={tipoChipId}
              onChange={(e) => {
                setTipoChipId(e.target.value);
                limpiar("tipoChipId");
              }}
              className={claseInput(errores.tipoChipId)}
            >
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </CampoFormulario>
        )}
        {pideTelefono && (
          <ListaConBuscador
            label={clave === "aFisico" ? "Teléfono sin línea (opcional)" : "Teléfono sin línea"}
            valor={activoId}
            onChange={(v) => {
              setActivoId(v);
              limpiar("activoId", "destino");
            }}
            error={errores.activoId}
            vacio={clave === "aFisico" ? "Ninguno: queda disponible" : "Elige un teléfono"}
            buscar="Buscar por marca, modelo o IMEI"
            opciones={opciones.celulares.map((c) => ({ id: c.id, texto: nombreCelular(c) }))}
          />
        )}
        {pidePersona && (
          <ListaConBuscador
            label={clave === "aEsim" ? "Persona (opcional)" : "Persona"}
            valor={empleadoId}
            onChange={(v) => {
              setEmpleadoId(v);
              limpiar("empleadoId", "destino");
            }}
            error={errores.empleadoId}
            vacio={clave === "aEsim" ? "Ninguna: queda disponible" : "Elige una persona"}
            buscar="Buscar por nombre o RUT"
            opciones={opciones.personas.map((p) => ({ id: p.id, texto: nombrePersona(p) + (p.rut ? ` · ${p.rut}` : "") }))}
          />
        )}
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
      </div>

      <div className="mt-4 flex justify-end gap-3">
        <Button variant="outline" onClick={() => onCerrar(false)}>
          Cancelar
        </Button>
        {/* Hasta que llegan las opciones no se sabe a que tipos de chip puede pasar. */}
        <Button loading={enviando} disabled={opciones === OPCIONES_VACIAS} leftIcon={<Repeat size={18} />} onClick={() => ejecutar(guardar)}>
          Guardar
        </Button>
      </div>
    </div>
  );
}
