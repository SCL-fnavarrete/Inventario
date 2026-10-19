"use client";

import { useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { parseApiError, mensajeDeError } from "@/shared/utilidades/apiErrors";
import { logger } from "@/shared/logger";
import { MensajeCampo, claseCampo } from "@/shared/ui/CampoFormulario";

export type ArticuloKitCreado = {
  id: string;
  nombre: string;
  categoria: "kit_bienvenida" | "epp";
  cantidad: number;
  sedeId: string | null;
};

/**
 * Crea un articulo de Kit/EPP que todavia no esta en el catalogo de la sede,
 * sin salir de la compra. Queda con stock 0: el stock sube al repartir lo
 * comprado. Lo usan Nueva compra y el detalle de la compra.
 */
export function NuevoArticuloKit({
  sedeId,
  onCreado,
}: {
  sedeId: string;
  onCreado: (item: ArticuloKitCreado) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState<ArticuloKitCreado["categoria"]>("kit_bienvenida");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Sin conexion u otra falla que no es del nombre: se avisa sin marcar el campo.
  const [errorGeneral, setErrorGeneral] = useState("");
  const campoNombre = useRef<HTMLInputElement>(null);
  // El error se marca en el nombre, el unico dato que se escribe, y lo deja listo para corregir.
  const fallar = (mensaje: string) => {
    setError(mensaje);
    campoNombre.current?.focus();
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-1 text-xs font-medium text-primary-700 hover:underline"
      >
        ¿No está en la lista? Crear artículo nuevo
      </button>
    );
  }

  async function crear() {
    if (!nombre.trim()) {
      fallar("Escribe el nombre del artículo");
      return;
    }
    setGuardando(true);
    setError("");
    setErrorGeneral("");
    try {
      const res = await fetch("/api/kit-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), categoria, sedeId }),
      });
      if (!res.ok) {
        const { message, fieldErrors } = await parseApiError(res, "No se pudo crear el artículo");
        fallar(fieldErrors.nombre ?? message);
        return;
      }
      onCreado(await res.json());
      setNombre("");
      setAbierto(false);
    } catch (err) {
      logger.error("Error creando artículo de Kit/EPP", err);
      setErrorGeneral(mensajeDeError(err, "No se pudo crear el artículo"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-line p-3">
      <p className="mb-2 text-xs font-medium text-fg-muted">Artículo nuevo (queda en el catálogo de esta sede)</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          ref={campoNombre}
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value);
            setError("");
          }}
          placeholder="Nombre, ej. Casco de seguridad"
          aria-label="Nombre del artículo"
          maxLength={200}
          aria-invalid={!!error}
          aria-describedby={error ? "nuevo-articulo-error" : undefined}
          className={`${claseCampo(error)} field-input-sm flex-1`}
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as ArticuloKitCreado["categoria"])}
          aria-label="Tipo de artículo"
          className="field-input field-input-sm sm:w-40"
        >
          <option value="kit_bienvenida">Kit Bienvenida</option>
          <option value="epp">EPP</option>
        </select>
        <button type="button" onClick={crear} disabled={guardando} className={buttonClasses({ size: "sm" })}>
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
          Crear
        </button>
        <button type="button" onClick={() => setAbierto(false)} className={buttonClasses({ size: "sm", variant: "outline" })}>
          Cancelar
        </button>
      </div>
      <MensajeCampo mensaje={error} id="nuevo-articulo-error" />
      <MensajeCampo mensaje={errorGeneral} />
    </div>
  );
}
