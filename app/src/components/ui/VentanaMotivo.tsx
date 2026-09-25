"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { buttonClasses } from "./buttonStyles";
import { CampoFormulario, claseCampo } from "./CampoFormulario";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Recibe el motivo ya sin espacios sobrantes. */
  onConfirm: (motivo: string) => void | Promise<void>;
  titulo: string;
  descripcion?: ReactNode;
  etiqueta?: string;
  placeholder?: string;
  textoConfirmar?: string;
  variante?: "primary" | "danger";
  cargando?: boolean;
};

/**
 * Ventana que pide un motivo obligatorio antes de una accion (cancelar una
 * solicitud, marcar un articulo como "No aplica"...). Reemplaza al
 * window.prompt() del navegador: el motivo vacio se marca en rojo, como en
 * el resto de los formularios (SPEC 2.104).
 */
export function VentanaMotivo({ isOpen, onClose, titulo, ...resto }: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titulo} size="md">
      {/* El contenido se crea al abrir: cada vez parte en blanco. */}
      {isOpen && <ContenidoMotivo onClose={onClose} {...resto} />}
    </Modal>
  );
}

function ContenidoMotivo({
  onClose,
  onConfirm,
  descripcion,
  etiqueta = "Motivo",
  placeholder,
  textoConfirmar = "Confirmar",
  variante = "primary",
  cargando = false,
}: Omit<Props, "isOpen" | "titulo">) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");

  function confirmar() {
    const limpio = motivo.trim();
    if (!limpio) {
      setError(`Escribe el ${etiqueta.toLowerCase()}`);
      return;
    }
    onConfirm(limpio);
  }

  return (
    <div className="space-y-4">
      {descripcion && <div className="text-sm text-fg-subtle">{descripcion}</div>}
      <CampoFormulario label={etiqueta} obligatorio error={error}>
        <textarea
          autoFocus
          rows={3}
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            setError("");
          }}
          placeholder={placeholder}
          aria-invalid={!!error}
          className={claseCampo(error)}
        />
      </CampoFormulario>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={cargando}
          className={buttonClasses({ variant: "outline" })}
        >
          Volver
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={cargando}
          className={buttonClasses({ variant: variante })}
        >
          {cargando ? "Guardando..." : textoConfirmar}
        </button>
      </div>
    </div>
  );
}
