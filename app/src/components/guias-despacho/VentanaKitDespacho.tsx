"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { CampoFormulario, CampoTexto, claseCampo } from "@/components/ui/CampoFormulario";

export type AccionKitDespacho = "llego" | "perdido" | "aparecio";

const TEXTOS: Record<AccionKitDespacho, { titulo: string; boton: string; explica: (sede: string) => string }> = {
  llego: {
    titulo: "Llegó Kit/EPP que faltaba",
    boton: "Llegó",
    explica: (sede) => `Se suma al stock de ${sede}.`,
  },
  perdido: {
    titulo: "Marcar Kit/EPP como perdido",
    boton: "Marcar como perdido",
    explica: () => 'Queda registrado como perdido, con el motivo. Si aparece después, se usa "Apareció".',
  },
  aparecio: {
    titulo: "Apareció Kit/EPP perdido",
    boton: "Apareció",
    explica: (sede) => `Pasa de perdido a recibido y se suma al stock de ${sede}.`,
  },
};

type Props = {
  /** La linea y la accion a resolver; null = ventana cerrada. */
  abierto: { accion: AccionKitDespacho; nombre: string; maximo: number } | null;
  sedeDestino: string;
  cargando: boolean;
  onClose: () => void;
  /** Devuelve los errores por campo del servidor, si los hubo. */
  onConfirm: (cantidad: number, motivo: string) => Promise<Record<string, string> | void>;
};

/**
 * Resolver unidades de una linea de Kit/EPP de un despacho (SPEC 2.111.4):
 * cuantas llegaron, se perdieron (con el motivo) o aparecieron.
 */
export function VentanaKitDespacho({ abierto, onClose, ...resto }: Props) {
  return (
    <Modal isOpen={abierto !== null} onClose={onClose} title={abierto ? TEXTOS[abierto.accion].titulo : ""} size="md">
      {/* Se monta al abrir: cada vez parte con la cantidad maxima. */}
      {abierto && <Contenido key={`${abierto.accion}-${abierto.nombre}`} abierto={abierto} onClose={onClose} {...resto} />}
    </Modal>
  );
}

function Contenido({
  abierto,
  sedeDestino,
  cargando,
  onClose,
  onConfirm,
}: Omit<Props, "abierto"> & { abierto: NonNullable<Props["abierto"]> }) {
  const [cantidad, setCantidad] = useState(String(abierto.maximo));
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const textos = TEXTOS[abierto.accion];

  async function confirmar() {
    const n = parseInt(cantidad, 10);
    const e: Record<string, string> = {};
    if (!n || n < 1) e.cantidad = "La cantidad debe ser al menos 1";
    else if (n > abierto.maximo) e.cantidad = `Como máximo ${abierto.maximo}`;
    if (abierto.accion === "perdido" && !motivo.trim()) e.motivo = "Escribe qué pasó";
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    const delServidor = await onConfirm(n, motivo.trim());
    if (delServidor) setErrores(delServidor);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        <strong>{abierto.nombre}</strong>. {textos.explica(sedeDestino)}
      </p>
      <CampoTexto
        label="Cantidad"
        obligatorio
        type="number"
        min={1}
        max={abierto.maximo}
        value={cantidad}
        onChange={(v) => {
          setCantidad(v);
          setErrores((prev) => ({ ...prev, cantidad: "" }));
        }}
        error={errores.cantidad || undefined}
        ayuda={`Hasta ${abierto.maximo}`}
      />
      {abierto.accion === "perdido" && (
        <CampoFormulario label="Qué pasó" obligatorio error={errores.motivo || undefined}>
          <textarea
            rows={3}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              setErrores((prev) => ({ ...prev, motivo: "" }));
            }}
            placeholder="Ej: la caja llegó abierta y faltaban..."
            className={claseCampo(errores.motivo || undefined)}
          />
        </CampoFormulario>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonClasses({ variant: "outline" })}>
          Volver
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={cargando}
          className={buttonClasses({ variant: abierto.accion === "perdido" ? "danger" : "primary" })}
        >
          {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
          {textos.boton}
        </button>
      </div>
    </div>
  );
}
