"use client";

import { useEffect, useState } from "react";
import { Phone, Loader2 } from "lucide-react";
import { cn } from "@/shared/cn";
import { formatearNumero } from "@/modules/lineas";
import { identificadorActivo } from "@/modules/activos";
import { SelectorBuscable } from "@/shared/ui/SelectorBuscable";
import { ElegirLineaCelular, SIN_LINEA } from "@/modules/solicitudes/componentes/nueva/ElegirLineaCelular";

type LineaPersona = {
  id: string;
  numero: string;
  tipoChip: { nombre: string; sinCelular: boolean } | null;
  activo: { id: string; marca: { nombre: string }; modelo: string } | null;
};

type CelularDisponible = {
  id: string;
  marca: { nombre: string };
  modelo: string;
  numeroSerie: string | null;
  imei: string | null;
  lineas?: { numero: string }[];
};

/**
 * Una linea de la persona que se cambia (SPEC 2.143). La de un celular: por otro chip fisico en
 * ese celular, o pasa a eSIM (devuelve el celular con su linea: lo hace la seccion de equipos).
 * Una eSIM: por otra eSIM, o pasa a chip fisico (se le entrega un celular disponible con su
 * linea; si no trae, se le asigna una). La anterior queda disponible.
 */
export type ItemCambioLinea = {
  lineaId: string;
  numero: string;
  // La linea esta en un celular de la empresa.
  deCelular: boolean;
  modo: "" | "chip" | "esim";
  newLineaId: string;
  // eSIM -> chip fisico: el celular que se entrega y si ya trae linea.
  newAssetId: string;
  celularConLinea: boolean;
};

/** Lo que le falta a una linea marcada, o null si esta completa. */
export function faltaEnLinea(item: ItemCambioLinea): string | null {
  const entregaCelular = item.modo === "chip" && !item.deCelular;
  const faltan = [
    !item.modo && "si es chip físico o eSIM",
    entregaCelular && !item.newAssetId && "el celular que se entrega",
    entregaCelular && item.newAssetId && !item.celularConLinea && !item.newLineaId && "la línea del celular",
    item.modo && !entregaCelular && !item.newLineaId && "la línea nueva",
  ].filter(Boolean);
  return faltan.length ? faltan.join(" y ") : null;
}

export const itemLineaCompleto = (item: ItemCambioLinea) => faltaEnLinea(item) === null;

/** Celulares disponibles de la sede (todas las categorias de ficha celular). */
async function celularesDisponibles(sedeId?: string | null): Promise<CelularDisponible[]> {
  const categorias: { id: string; tipoFicha?: string }[] = await fetch("/api/categorias")
    .then((r) => r.json())
    .then((d) => d.data || d);
  const listas = await Promise.all(
    categorias
      .filter((c) => c.tipoFicha === "celular")
      .map((c) => {
        const params = new URLSearchParams({ categoriaId: c.id, estado: "disponible", limit: "100" });
        if (sedeId) params.set("sedeId", sedeId);
        return fetch(`/api/activos?${params}`)
          .then((r) => r.json())
          .then((d) => (d.data || []) as CelularDisponible[]);
      })
  );
  return listas.flat();
}

const textoCelular = (c: CelularDisponible) => `${c.marca.nombre} ${c.modelo} · ${identificadorActivo(c, "s/serie")}`;

/**
 * Lineas de la persona con una casilla cada una. Reporta las marcadas (aunque falten
 * datos) por onChange. Si el celular de una linea se cambia en esta misma solicitud,
 * la linea no se ofrece: queda en ese celular.
 */
export function SeleccionarCambioLinea({
  empleadoId,
  sedeId,
  celularesEnCambio,
  activosElegidos,
  onChange,
  onPasarAEsim,
  marcarIncompletos = false,
}: {
  empleadoId: string;
  /** Sede de la solicitud: el celular que se entrega sale de su bodega. */
  sedeId?: string | null;
  /** Ids de los celulares (equipo) que se estan cambiando en la solicitud. */
  celularesEnCambio: string[];
  /** Equipos ya elegidos como reemplazo en la seccion de equipos (no se ofrecen aqui). */
  activosElegidos: string[];
  onChange: (items: ItemCambioLinea[]) => void;
  /** La linea de un celular pasa a eSIM: el celular se devuelve con su linea (lo marca la seccion de equipos). */
  onPasarAEsim: (activoId: string) => void;
  marcarIncompletos?: boolean;
}) {
  const [lineas, setLineas] = useState<LineaPersona[] | null>(null);
  const [items, setItems] = useState<Record<string, ItemCambioLinea>>({});
  // Se cargan la primera vez que una eSIM pasa a chip fisico.
  const [celulares, setCelulares] = useState<CelularDisponible[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/empleados/${empleadoId}/lineas`)
      .then((res) => (res.ok ? res.json() : []))
      .then((datos: LineaPersona[]) => {
        if (!cancelado) setLineas(datos);
      })
      .catch(() => {
        if (!cancelado) setLineas([]);
      });
    return () => {
      cancelado = true;
    };
  }, [empleadoId]);

  // Una linea cuyo celular se cambia deja de poder marcarse.
  const enCambio = (l: LineaPersona) => !!l.activo && celularesEnCambio.includes(l.activo.id);
  const visibles = lineas?.filter((l) => !enCambio(l)) ?? [];

  useEffect(() => {
    onChange(Object.values(items).filter((i) => visibles.some((l) => l.id === i.lineaId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, lineas, celularesEnCambio.join(",")]);

  const actualizar = (id: string, cambios: Partial<ItemCambioLinea>) =>
    setItems((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));

  const alternar = (l: LineaPersona, marcado: boolean) =>
    setItems((prev) => {
      const next = { ...prev };
      if (marcado) {
        next[l.id] = { lineaId: l.id, numero: l.numero, deCelular: !!l.activo, modo: "", newLineaId: "", newAssetId: "", celularConLinea: false };
      } else delete next[l.id];
      return next;
    });

  const elegirModo = (l: LineaPersona, modo: "chip" | "esim") => {
    // Pasar a eSIM la de un celular es devolver el celular: lo hace la seccion de equipos.
    if (modo === "esim" && l.activo) {
      alternar(l, false);
      onPasarAEsim(l.activo.id);
      return;
    }
    if (modo === "chip" && !l.activo && celulares === null) {
      celularesDisponibles(sedeId)
        .then(setCelulares)
        .catch(() => setCelulares([]));
    }
    actualizar(l.id, { modo, newLineaId: "", newAssetId: "", celularConLinea: false });
  };

  if (lineas === null) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-fg-subtle">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando líneas...
      </div>
    );
  }
  if (visibles.length === 0) return <p className="text-sm text-fg-subtle">Esta persona no tiene líneas para cambiar.</p>;

  return (
    <div className="space-y-3">
      {visibles.map((l) => {
        const item = items[l.id];
        const incompleto = !!item && marcarIncompletos && !itemLineaCompleto(item);
        const otros = Object.values(items).filter((i) => i.lineaId !== l.id);
        const excluidas = otros.flatMap((i) => (i.newLineaId ? [i.newLineaId] : []));
        const entregaCelular = item?.modo === "chip" && !item.deCelular;
        // Un celular elegido para otra linea o como reemplazo de un equipo no se ofrece.
        const usados = new Set([...activosElegidos, ...otros.map((i) => i.newAssetId)]);
        const opciones = (celulares ?? []).filter((c) => !usados.has(c.id));
        const modos = l.activo
          ? ([["chip", "Otro chip físico (en el mismo celular)"], ["esim", "Pasar a eSIM (devuelve el celular con su línea)"]] as const)
          : ([["esim", "Otra eSIM"], ["chip", "Pasar a chip físico (se le entrega un celular)"]] as const);
        return (
          <div
            key={l.id}
            tabIndex={incompleto ? -1 : undefined}
            aria-invalid={incompleto}
            className={cn(
              "rounded-lg border p-3 outline-none",
              incompleto ? "border-red-500 bg-red-50" : item ? "border-primary-200 bg-primary-50" : "border-line"
            )}
          >
            <label className="flex cursor-pointer items-center gap-3">
              <input type="checkbox" className="field-checkbox" checked={!!item} onChange={(e) => alternar(l, e.target.checked)} />
              <Phone className="h-4 w-4 text-fg-muted" />
              <span className="min-w-0 text-sm">
                <span className="font-medium text-fg">Línea: {formatearNumero(l.numero)}</span>
                <span className="block text-xs text-fg-subtle">
                  {l.activo ? `En el celular ${l.activo.marca.nombre} ${l.activo.modelo}` : `${l.tipoChip?.nombre ?? "eSIM"} · con la persona`}
                </span>
              </span>
            </label>

            {item && (
              <div className="mt-3 space-y-2 pl-7">
                {incompleto && <p className="text-xs text-red-600">Falta {faltaEnLinea(item)}.</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {modos.map(([modo, titulo]) => (
                    <label key={modo} className={cn("flex cursor-pointer items-center gap-1.5 text-xs", item.modo === modo ? "text-fg" : "text-fg-muted")}>
                      <input type="radio" name={`modo-linea-${l.id}`} checked={item.modo === modo} onChange={() => elegirModo(l, modo)} />
                      {titulo}
                    </label>
                  ))}
                </div>

                {/* eSIM -> chip fisico: se entrega un celular disponible; si no trae linea, se le asigna una. */}
                {entregaCelular &&
                  (celulares === null ? (
                    <div className="flex items-center gap-2 py-1 text-xs text-fg-subtle">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Cargando celulares disponibles...
                    </div>
                  ) : (
                    <SelectorBuscable
                      opciones={opciones}
                      value={item.newAssetId}
                      onChange={(id) => {
                        const elegido = opciones.find((c) => c.id === id);
                        actualizar(l.id, { newAssetId: id, newLineaId: "", celularConLinea: !!elegido?.lineas?.length });
                      }}
                      textoDe={(c) => [c.marca.nombre, c.modelo, c.numeroSerie, c.imei, ...(c.lineas ?? []).map((x) => x.numero)]}
                      etiquetaElegida={textoCelular}
                      renderOpcion={(c) => (
                        <>
                          <span className="block font-medium text-fg">{textoCelular(c)}</span>
                          <span className="block text-xs text-fg-subtle">
                            {c.lineas?.length ? `Línea ${c.lineas.map((x) => formatearNumero(x.numero)).join(", ")}` : "Sin línea"}
                          </span>
                        </>
                      )}
                      placeholder="Elige el celular que se entrega..."
                      buscar="Buscar por marca, modelo, serie, IMEI o número"
                      vacio="No hay celulares disponibles en esta sede"
                    />
                  ))}
                {entregaCelular && item.newAssetId && !item.celularConLinea && (
                  <ElegirLineaCelular
                    valor={item.newLineaId ? { modo: "fisico", lineaId: item.newLineaId } : SIN_LINEA}
                    onChange={(v) => actualizar(l.id, { newLineaId: v.lineaId })}
                    excluidas={excluidas}
                  />
                )}

                {item.modo && !entregaCelular && (
                  <ElegirLineaCelular
                    key={item.modo}
                    tipo={item.modo === "esim" ? "esim" : "fisico"}
                    titulo={item.modo === "esim" ? "eSIM nueva de la persona" : "Chip físico nuevo (con número)"}
                    valor={item.newLineaId ? { modo: "fisico", lineaId: item.newLineaId } : SIN_LINEA}
                    onChange={(v) => actualizar(l.id, { newLineaId: v.lineaId })}
                    excluidas={excluidas}
                  />
                )}
                <p className="text-xs text-fg-subtle">
                  {entregaCelular ? "La eSIM queda disponible y la persona recibe el celular con su línea." : "La línea anterior queda disponible."}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
