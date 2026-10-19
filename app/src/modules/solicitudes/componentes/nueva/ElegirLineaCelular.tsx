"use client";

import { useEffect, useState } from "react";
import { formatearNumero } from "@/modules/lineas";
import { MensajeCampo } from "@/shared/ui/CampoFormulario";
import { SelectorBuscable } from "@/shared/ui/SelectorBuscable";

/**
 * Linea de un celular de la empresa que se entrega sin linea (SPEC 2.143): es
 * opcional (SPEC 2.160) y es un chip fisico (con numero), que queda en el celular. Con
 * tipo "esim" (el empleado usa su propio telefono) se elige una eSIM, que queda
 * con la persona. Solo se ofrecen lineas disponibles: activas y sin persona. Un chip
 * fisico puede estar en un celular de bodega (sin persona): al elegirlo se mueve a
 * este celular (SPEC 2.163). Una linea con persona cambia solo con su solicitud.
 */
export type EleccionLinea = { modo: "ninguna" | "fisico"; lineaId: string };
export const SIN_LINEA: EleccionLinea = { modo: "ninguna", lineaId: "" };

type LineaDisponible = {
  id: string;
  numero: string;
  operador: { nombre: string } | null;
  tipoChip: { sinCelular: boolean } | null;
  // Celular de bodega donde esta hoy el chip (sin persona: la consulta pide asignacion=sin).
  activo: { marca: { nombre: string }; modelo: string } | null;
};
type Opcion = { id: string; texto: string };

const textoDe = (o: Opcion) => [o.texto];
const mostrar = (o: Opcion) => o.texto;

export function ElegirLineaCelular({
  valor,
  onChange,
  excluidas = [],
  error,
  tipo = "fisico",
  titulo,
  aviso,
}: {
  valor: EleccionLinea;
  onChange: (v: EleccionLinea) => void;
  /** Lineas ya elegidas para otro celular de la misma solicitud. */
  excluidas?: string[];
  error?: string;
  tipo?: "fisico" | "esim";
  /** Texto sobre el selector; por defecto el de un celular sin linea. */
  titulo?: string;
  /** Aviso bajo el selector mientras no se elige linea. */
  aviso?: string;
}) {
  const [lineas, setLineas] = useState<LineaDisponible[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/lineas?asignacion=sin&estado=vigentes")
      .then((res) => (res.ok ? res.json() : []))
      .then((datos: (LineaDisponible & { empleado: unknown })[]) => {
        // asignacion=sin ya deja fuera las que tienen persona; esto lo asegura.
        if (!cancelado) setLineas(datos.filter((l) => !l.empleado));
      })
      .catch(() => {
        if (!cancelado) setLineas([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const opciones: Opcion[] = (lineas ?? [])
    .filter((l) => !!l.tipoChip?.sinCelular === (tipo === "esim") && (!excluidas.includes(l.id) || l.id === valor.lineaId))
    .map((l) => ({
      id: l.id,
      texto: `${formatearNumero(l.numero)}${l.operador ? ` · ${l.operador.nombre}` : ""}${
        l.activo ? ` — está en ${l.activo.marca.nombre} ${l.activo.modelo} (sin persona), se moverá a este celular` : ""
      }`,
    }));

  return (
    <div className="ml-6 mt-1 mb-1 rounded-lg border border-line p-2">
      <p className="mb-1 text-xs font-medium text-fg-muted">
        {titulo ?? (tipo === "esim" ? "eSIM de la persona" : "Este celular no tiene línea: elige su chip físico (opcional)")}
      </p>
      <SelectorBuscable
        opciones={opciones}
        value={valor.lineaId}
        onChange={(id) => onChange({ modo: id ? "fisico" : "ninguna", lineaId: id })}
        textoDe={textoDe}
        renderOpcion={mostrar}
        etiquetaElegida={mostrar}
        placeholder={tipo === "esim" ? "Elige una eSIM disponible" : "Sin línea (se puede asociar después)"}
        buscar="Buscar por número u operador"
        vacio={lineas === null ? "Cargando..." : `No hay ${tipo === "esim" ? "eSIM" : "líneas con chip físico"} disponibles: créalas en Líneas`}
        invalido={!!error}
      />
      <p className="mt-1 text-xs text-fg-subtle">
        {tipo === "esim" ? "La eSIM queda con la persona, que usará su propio teléfono." : "La línea queda en el celular y la recibe la persona con él."}
      </p>
      {aviso && <p className="mt-1 text-xs text-amber-700">{aviso}</p>}
      <MensajeCampo mensaje={error} />
    </div>
  );
}
