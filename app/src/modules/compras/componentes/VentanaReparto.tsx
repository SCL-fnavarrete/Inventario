"use client";

import { useState } from "react";
import { Loader2, Send, Truck, PackageCheck } from "lucide-react";
import { Modal } from "@/shared/ui/Modal";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import {
  AvisoSeccion,
  CampoFormulario,
  CampoTexto,
  ResumenErrores,
  claseCampo,
} from "@/shared/ui/CampoFormulario";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { parseApiError, mensajeDeError } from "@/shared/utilidades/apiErrors";
import { ahoraParaInputFechaHora, inputFechaHoraAISO } from "@/shared/utilidades/fechas";
import { ETIQUETAS_GUIA, validarDatosDespacho } from "@/modules/despachos";
import { identificadorActivo } from "@/modules/activos";

type EquipoPendiente = { id: string; marca: { nombre: string }; modelo: string; numeroSerie: string | null; categoria: string };
type LineaPendiente = { id: string; nombre: string; porRepartir: number };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Tras repartir: el numero del despacho creado, o null si quedo en la sede de llegada. */
  onRepartido: (despacho: { id: string; numero: string } | null) => void;
  compraId: string;
  sedeLlegada: { id: string; nombre: string };
  sedes: { id: string; nombre: string }[];
  equipos: EquipoPendiente[];
  lineas: LineaPendiente[];
};

const ETIQUETAS = { ...ETIQUETAS_GUIA, reparto: "Qué se reparte", kit: "Kit/EPP" };

/**
 * Repartir parte de una compra a una sede (SPEC 2.111.3), de a una sede por
 * vez. A la sede de llegada queda disponible en el momento; a otra sede se
 * piden los datos del despacho, con las mismas reglas que Despachos > Nuevo.
 */
export function VentanaReparto({ isOpen, onClose, ...resto }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Repartir a una sede" size="2xl">
      {/* Se monta al abrir: cada reparto parte limpio. */}
      {isOpen && <ContenidoReparto onClose={onClose} {...resto} />}
    </Modal>
  );
}

function ContenidoReparto({
  onClose,
  onRepartido,
  compraId,
  sedeLlegada,
  sedes,
  equipos,
  lineas,
}: Omit<Props, "isOpen">) {
  const [sedeDestinoId, setSedeDestinoId] = useState(sedeLlegada.id);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [envio, setEnvio] = useState({
    otChilexpress: "",
    fechaDespacho: ahoraParaInputFechaHora(),
    receptorNombre: "",
    receptorRut: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);

  const aLaLlegada = sedeDestinoId === sedeLlegada.id;
  const nombreDestino = sedes.find((s) => s.id === sedeDestinoId)?.nombre ?? "";

  function alternar(id: string) {
    limpiar("reparto");
    setElegidos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function cambiarEnvio(campo: keyof typeof envio, valor: string) {
    setEnvio((prev) => ({ ...prev, [campo]: valor }));
    limpiar(campo);
  }

  // Cantidades de Kit/EPP que se reparten (las vacias o en 0 no cuentan).
  const kit = lineas
    .map((l) => ({ lineaId: l.id, cantidad: parseInt(cantidades[l.id] || "0", 10) || 0, linea: l }))
    .filter((k) => k.cantidad > 0);

  async function repartir() {
    const faltan: Record<string, string> = {};
    if (elegidos.size === 0 && kit.length === 0) faltan.reparto = "Elige al menos un equipo o una cantidad de Kit/EPP";
    const excedida = kit.find((k) => k.cantidad > k.linea.porRepartir);
    if (excedida) faltan.kit = `De ${excedida.linea.nombre} quedan ${excedida.linea.porRepartir} por repartir`;
    if (!aLaLlegada) Object.assign(faltan, validarDatosDespacho({ ...envio, sedeDestinoId }));
    if (reportar(faltan)) return;

    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/compras/${compraId}/repartir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sedeDestinoId,
          equipos: [...elegidos],
          kit: kit.map(({ lineaId, cantidad }) => ({ lineaId, cantidad })),
          ...(!aLaLlegada && {
            envio: { ...envio, fechaDespacho: inputFechaHoraAISO(envio.fechaDespacho) },
          }),
        }),
      });
      if (!res.ok) {
        const { message, fieldErrors } = await parseApiError(res, "Error al repartir");
        if (!reportarServidor(fieldErrors)) setError(message);
        return;
      }
      const { despacho } = await res.json();
      onRepartido(despacho);
    } catch (err) {
      setError(mensajeDeError(err, "Error al repartir"));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-6">
      <ResumenErrores mensaje={resumen} />
      {error && <AvisoSeccion mensaje={error} />}

      <CampoFormulario
        label="Sede destino"
        obligatorio
        error={errores.sedeDestinoId}
        ayuda={
          aLaLlegada
            ? `Se queda en ${sedeLlegada.nombre}: pasa a Disponible y el Kit/EPP suma a su stock ahora.`
            : `Sale en un despacho desde ${sedeLlegada.nombre}. ${nombreDestino} confirma lo que llega en Despachos.`
        }
      >
        <select
          value={sedeDestinoId}
          onChange={(e) => {
            setSedeDestinoId(e.target.value);
            limpiar("sedeDestinoId");
          }}
          className={claseCampo(errores.sedeDestinoId)}
        >
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
              {s.id === sedeLlegada.id ? " (sede de llegada)" : ""}
            </option>
          ))}
        </select>
      </CampoFormulario>

      <div>
        <div className="flex items-center justify-between">
          <p className="field-label">Equipos por repartir</p>
          {equipos.length > 1 && (
            <button
              type="button"
              className="text-xs text-primary-700 hover:text-primary-900"
              onClick={() => {
                limpiar("reparto");
                setElegidos(elegidos.size === equipos.length ? new Set() : new Set(equipos.map((e) => e.id)));
              }}
            >
              {elegidos.size === equipos.length ? "Quitar todos" : "Elegir todos"}
            </button>
          )}
        </div>
        {equipos.length === 0 ? (
          <p className="text-sm text-fg-subtle">No quedan equipos por repartir.</p>
        ) : (
          <div className="max-h-[40vh] overflow-y-auto rounded-control border border-line divide-y divide-line">
            {equipos.map((e) => (
              <label key={e.id} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-muted cursor-pointer">
                <input type="checkbox" className="h-4 w-4" checked={elegidos.has(e.id)} onChange={() => alternar(e.id)} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">
                    {e.marca.nombre} {e.modelo}
                  </span>
                  <span className="block text-xs text-fg-subtle break-all">
                    {e.categoria} • {identificadorActivo(e, "Sin serie")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {lineas.length > 0 && (
        <div>
          <p className="field-label">Kit/EPP por repartir</p>
          <div className="rounded-control border border-line divide-y divide-line">
            {lineas.map((l) => (
              <div key={l.id} className="flex items-center gap-4 px-4 py-3">
                <span className="flex-1 text-sm">
                  {l.nombre}
                  <span className="block text-xs text-fg-subtle">Quedan {l.porRepartir} por repartir</span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={l.porRepartir}
                  inputMode="numeric"
                  placeholder="0"
                  aria-label={`Cantidad de ${l.nombre}`}
                  value={cantidades[l.id] ?? ""}
                  onChange={(ev) => {
                    limpiar("kit");
                    limpiar("reparto");
                    setCantidades((prev) => ({ ...prev, [l.id]: ev.target.value }));
                  }}
                  className="field-input w-28 text-center"
                />
              </div>
            ))}
          </div>
          <AvisoSeccion mensaje={errores.kit} />
        </div>
      )}
      <AvisoSeccion mensaje={errores.reparto} />

      {!aLaLlegada && (
        <div className="space-y-5 rounded-control border border-line p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-fg">
            <Truck size={16} /> Datos del despacho a {nombreDestino}
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <CampoTexto
              label="OT Chilexpress"
              obligatorio
              placeholder="Ej: 123456789"
              value={envio.otChilexpress}
              onChange={(v) => cambiarEnvio("otChilexpress", v)}
              error={errores.otChilexpress}
            />
            <CampoTexto
              label="Fecha de envío"
              obligatorio
              type="datetime-local"
              value={envio.fechaDespacho}
              onChange={(v) => cambiarEnvio("fechaDespacho", v)}
              error={errores.fechaDespacho}
            />
            <CampoTexto
              label="Nombre de quien recibe"
              obligatorio
              value={envio.receptorNombre}
              onChange={(v) => cambiarEnvio("receptorNombre", v)}
              error={errores.receptorNombre}
            />
            <CampoTexto
              label="RUT de quien recibe"
              obligatorio
              placeholder="XX.XXX.XXX-X"
              value={envio.receptorRut}
              onChange={(v) => cambiarEnvio("receptorRut", v)}
              error={errores.receptorRut}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-line pt-4">
        <button type="button" onClick={onClose} className={buttonClasses({ variant: "outline" })}>
          Cancelar
        </button>
        <button type="button" onClick={repartir} disabled={enviando} className={buttonClasses()}>
          {enviando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : aLaLlegada ? (
            <PackageCheck size={18} />
          ) : (
            <Send size={18} />
          )}
          {aLaLlegada ? `Dejar en ${sedeLlegada.nombre}` : `Despachar a ${nombreDestino}`}
        </button>
      </div>
    </div>
  );
}
