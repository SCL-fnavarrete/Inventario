"use client";

import { useEffect, useRef, useState } from "react";
import {
  Laptop,
  Smartphone,
  Monitor,
  Headphones,
  Printer,
  Mouse,
  Keyboard,
  Webcam,
  HardDrive,
  Package,
  Loader2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/shared/cn";
import {
  especificacionesActivoTexto,
  CONDICION_CARGADOR_POR_DEFECTO,
  type CondicionCargador,
  identificadorActivo,
} from "@/modules/activos";
import { SelectCondicionCargador } from "@/modules/activos/componentes";
import { useMotivosBaja } from "@/modules/mantenciones/componentes";

type AsignacionActiva = {
  id: string;
  activo: boolean;
  asset: {
    id: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
    imei?: string | null;
    categoria: { nombre: string };
    tieneCargador: boolean;
  };
};

type ActivoDisponible = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  imei: string | null;
  numeroTelefono: string | null;
  tipoPlan: string | null;
  pulgadas: string | number | null;
  conectividad: string | null;
  tipoLicenciaMicrosoft365: string | null;
  tieneCargador: boolean;
};

type Categoria = { id: string; nombre: string };

// SPEC 2.126: "No devolvió" es solo de la desvinculación; aquí el equipo
// vuelve bien, dañado o para darlo de baja con un motivo de la lista.
type EstadoDevolucion = "ok" | "danado" | "baja";

/**
 * Un equipo marcado para cambiar: el que se devuelve (con su estado) y su
 * reemplazo. newAssetId y estadoDevolucion quedan en "" mientras falten;
 * el padre valida con itemCambioCompleto antes de enviar.
 */
export type ItemCambioEquipo = {
  oldAssignmentId: string;
  newAssetId: string;
  estadoDevolucion: EstadoDevolucion | "";
  // Con estadoDevolucion "baja": el motivo elegido y, si es "Otro", su detalle.
  motivoBajaId: string;
  motivoBajaDetalle: string;
  motivoPideDetalle: boolean;
  observaciones: string;
  // Condicion del cargador: solo si el equipo tiene cargador; si no, "".
  // "Anterior" es el cargador que se devuelve, "Nuevo" el del reemplazo.
  condicionCargadorAnterior: CondicionCargador | "";
  observacionesCargadorAnterior: string;
  condicionCargadorNuevo: CondicionCargador | "";
  observacionesCargadorNuevo: string;
};

/** Lo que le falta a un equipo marcado, o null si esta completo. */
export function faltaEnCambio(item: ItemCambioEquipo): string | null {
  const faltan = [
    !item.estadoDevolucion && "el estado de devolución",
    item.estadoDevolucion === "baja" && item.motivoPideDetalle && !item.motivoBajaDetalle.trim() && "el detalle del motivo",
    !item.newAssetId && "el reemplazo",
  ].filter(Boolean);
  return faltan.length ? faltan.join(" y ") : null;
}

export function itemCambioCompleto(item: ItemCambioEquipo): boolean {
  return faltaEnCambio(item) === null;
}

const ITEM_VACIO: Omit<ItemCambioEquipo, "oldAssignmentId"> = {
  newAssetId: "",
  estadoDevolucion: "",
  motivoBajaId: "",
  motivoBajaDetalle: "",
  motivoPideDetalle: false,
  observaciones: "",
  condicionCargadorAnterior: "",
  observacionesCargadorAnterior: "",
  condicionCargadorNuevo: "",
  observacionesCargadorNuevo: "",
};

const ICONOS: Record<string, React.ReactNode> = {
  Notebook: <Laptop className="h-4 w-4" />,
  Celular: <Smartphone className="h-4 w-4" />,
  Monitor: <Monitor className="h-4 w-4" />,
  "Audífonos": <Headphones className="h-4 w-4" />,
  Impresora: <Printer className="h-4 w-4" />,
  Mouse: <Mouse className="h-4 w-4" />,
  Keyboard: <Keyboard className="h-4 w-4" />,
  Teclado: <Keyboard className="h-4 w-4" />,
  Webcam: <Webcam className="h-4 w-4" />,
  "Docking Station": <HardDrive className="h-4 w-4" />,
};

function iconoDe(nombre: string): React.ReactNode {
  return ICONOS[nombre] || <Package className="h-4 w-4" />;
}

// La lista de campos que se muestran por categoría vive en
// especificacionesActivoTexto (@/modules/activos/especificaciones).
const especificaciones = especificacionesActivoTexto;

/**
 * Selector de "Cambio de Equipo" (SPEC 2.84). El tecnico marca uno o varios
 * de los equipos asignados al empleado, de cualquier categoria; por cada
 * uno elige el estado en que vuelve y un reemplazo disponible de la misma
 * categoria en la sede. Un reemplazo ya elegido no se ofrece para otro
 * equipo. Reporta la lista (incluso incompleta) via onChange; con
 * marcarIncompletos, los equipos marcados sin completar se ven en rojo.
 * El inventario se carga para la sede con que se monto: si la sede cambia,
 * el padre lo remonta (key={sedeId}).
 */
export function SeleccionarCambioEquipo({
  asignacionesActivas,
  sedeId,
  onChange,
  marcarIncompletos = false,
}: {
  asignacionesActivas: AsignacionActiva[];
  /** Sede de la SOLICITUD: solo se ofrecen equipos de esa bodega. */
  sedeId?: string | null;
  onChange: (items: ItemCambioEquipo[]) => void;
  marcarIncompletos?: boolean;
}) {
  // Equipos marcados, por id de asignacion.
  const [items, setItems] = useState<Record<string, ItemCambioEquipo>>({});
  // Inventario disponible por nombre de categoria; se carga al marcar el
  // primer equipo de esa categoria (ver alternar).
  const [disponibles, setDisponibles] = useState<Record<string, ActivoDisponible[]>>({});
  const [cargando, setCargando] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const categoriasRef = useRef<Promise<Categoria[]> | null>(null);
  const motivosBaja = useMotivosBaja();

  const activas = asignacionesActivas.filter((a) => a.activo);

  async function cargarCategoria(nombre: string) {
    if (disponibles[nombre] || cargando[nombre]) return;
    setCargando((prev) => ({ ...prev, [nombre]: true }));
    try {
      categoriasRef.current ??= fetch("/api/categorias")
        .then((r) => r.json())
        .then((data) => data.data || data);
      const categoria = (await categoriasRef.current).find((cat) => cat.nombre === nombre);
      let lista: ActivoDisponible[] = [];
      if (categoria) {
        const params = new URLSearchParams({
          categoriaId: categoria.id,
          estado: "disponible",
          limit: "100",
        });
        // Solo el inventario de la sede de la solicitud.
        if (sedeId) params.set("sedeId", sedeId);
        lista = (await (await fetch(`/api/activos?${params}`)).json()).data || [];
      }
      setDisponibles((prev) => ({ ...prev, [nombre]: lista }));
    } catch {
      setError("No se pudo cargar el inventario disponible");
    } finally {
      setCargando((prev) => ({ ...prev, [nombre]: false }));
    }
  }

  const disponibleDe = (item: ItemCambioEquipo) => {
    const asignacion = activas.find((a) => a.id === item.oldAssignmentId);
    const lista = asignacion ? disponibles[asignacion.asset.categoria.nombre] || [] : [];
    return lista.find((d) => d.id === item.newAssetId);
  };

  // Lo que se ve es lo que se guarda: con cargador y sin tocar el select,
  // se manda el valor por defecto que muestra.
  const efectivo = (item: ItemCambioEquipo): ItemCambioEquipo => {
    const asignacion = activas.find((a) => a.id === item.oldAssignmentId);
    return {
      ...item,
      condicionCargadorAnterior: asignacion?.asset.tieneCargador
        ? item.condicionCargadorAnterior || CONDICION_CARGADOR_POR_DEFECTO
        : "",
      condicionCargadorNuevo: disponibleDe(item)?.tieneCargador
        ? item.condicionCargadorNuevo || CONDICION_CARGADOR_POR_DEFECTO
        : "",
    };
  };

  // Informa al padre la lista en el orden de los equipos del empleado.
  // onChange es un setter de estado del padre (referencia estable).
  useEffect(() => {
    onChange(activas.filter((a) => items[a.id]).map((a) => efectivo(items[a.id])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, disponibles]);

  const alternar = (id: string, marcado: boolean) => {
    setItems((prev) => {
      const next = { ...prev };
      if (marcado) next[id] = { oldAssignmentId: id, ...ITEM_VACIO };
      else delete next[id];
      return next;
    });
    const categoria = activas.find((a) => a.id === id)?.asset.categoria.nombre;
    if (marcado && categoria) cargarCategoria(categoria);
  };

  const actualizar = (id: string, cambios: Partial<ItemCambioEquipo>) =>
    setItems((prev) => ({ ...prev, [id]: { ...prev[id], ...cambios } }));

  if (activas.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
        Este empleado no tiene equipos asignados actualmente para cambiar.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      <p className="text-xs text-fg-subtle">
        Marca los equipos que se cambian (uno, varios o todos) y elige el reemplazo de cada uno.
      </p>

      {activas.map((a) => {
        const item = items[a.id];
        const categoria = a.asset.categoria.nombre;
        const incompleto = !!item && marcarIncompletos && !itemCambioCompleto(item);
        // Reemplazos ya elegidos para otros equipos no se ofrecen aca.
        const usados = new Set(
          Object.values(items)
            .filter((it) => it.oldAssignmentId !== a.id && it.newAssetId)
            .map((it) => it.newAssetId)
        );
        const opciones = (disponibles[categoria] || []).filter((d) => !usados.has(d.id));
        const nuevo = item ? disponibleDe(item) : undefined;

        return (
          <div
            key={a.id}
            // Marcado e incompleto tras intentar enviar: en rojo y enfocable,
            // para que enfocarPrimerError() lleve hasta aca.
            tabIndex={incompleto ? -1 : undefined}
            aria-invalid={incompleto}
            className={cn(
              "rounded-lg border p-3 outline-none",
              incompleto
                ? "border-red-500 bg-red-50"
                : item
                  ? "border-primary-200 bg-primary-50"
                  : "border-line"
            )}
          >
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                className="field-checkbox"
                checked={!!item}
                onChange={(e) => alternar(a.id, e.target.checked)}
              />
              <span className="text-fg-muted">{iconoDe(categoria)}</span>
              <span className="min-w-0 text-sm">
                <span className="font-medium text-fg">
                  {categoria}: {a.asset.marca} {a.asset.modelo}
                </span>
                <span className="block text-xs text-fg-subtle">
                  Serie: {identificadorActivo(a.asset, "Sin serie")}
                </span>
              </span>
            </label>

            {item && (
              <div className="mt-3 space-y-3 pl-7">
                {incompleto && <p className="text-xs text-red-600">Falta {faltaEnCambio(item)}.</p>}

                {/* Estado en que vuelve el equipo actual. */}
                <div>
                  <p className="field-label">¿En qué estado lo devuelve?</p>
                  <div className="flex flex-wrap gap-4 text-sm text-fg-muted">
                    {(
                      [
                        ["ok", "Buen estado"],
                        ["danado", "Dañado"],
                      ] as const
                    ).map(([valor, etiqueta]) => (
                      <label key={valor} className="flex items-center gap-1.5">
                        <input
                          type="radio"
                          name={`estado-cambio-${a.id}`}
                          checked={item.estadoDevolucion === valor}
                          onChange={() =>
                            actualizar(a.id, { estadoDevolucion: valor, motivoBajaId: "", motivoPideDetalle: false })
                          }
                        />
                        {etiqueta}
                      </label>
                    ))}
                  </div>
                  {/* Para dar de baja: cada motivo de la lista es una opcion. El
                      equipo queda de baja en el acto (SPEC 2.126). */}
                  {motivosBaja.length > 0 && (
                    <>
                      <p className="mt-2 text-xs text-fg-subtle">Para dar de baja por:</p>
                      <div className="flex flex-wrap gap-4 text-sm text-fg-muted">
                        {motivosBaja.map((m) => (
                          <label key={m.id} className="flex min-w-0 max-w-full items-center gap-1.5 wrap-anywhere">
                            <input
                              type="radio"
                              name={`estado-cambio-${a.id}`}
                              checked={item.estadoDevolucion === "baja" && item.motivoBajaId === m.id}
                              onChange={() =>
                                actualizar(a.id, {
                                  estadoDevolucion: "baja",
                                  motivoBajaId: m.id,
                                  motivoPideDetalle: m.clave === "otro",
                                })
                              }
                            />
                            {m.nombre}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                  {item.estadoDevolucion === "baja" && item.motivoPideDetalle && (
                    <input
                      type="text"
                      value={item.motivoBajaDetalle}
                      maxLength={500}
                      onChange={(e) => actualizar(a.id, { motivoBajaDetalle: e.target.value })}
                      placeholder="Describe el motivo (obligatorio)"
                      aria-label="Detalle del motivo de baja"
                      className="field-input field-input-sm mt-2"
                    />
                  )}
                  {item.estadoDevolucion === "baja" && (
                    <p className="mt-1 text-xs text-fg-subtle">
                      El equipo queda de baja con este motivo (en Mantenciones queda registrado como &ldquo;No reparable&rdquo;).
                    </p>
                  )}
                  <input
                    type="text"
                    value={item.observaciones}
                    onChange={(e) => actualizar(a.id, { observaciones: e.target.value })}
                    placeholder="Observaciones (opcional)"
                    className="field-input field-input-sm mt-2"
                  />
                </div>

                {/* Cargador del equipo que se devuelve (informativo, para el acta). */}
                {a.asset.tieneCargador && (
                  <div className="rounded-lg border border-line bg-surface p-3">
                    <p className="mb-2 text-xs font-medium text-fg-muted">
                      Estado del cargador que devuelve
                    </p>
                    <SelectCondicionCargador
                      contexto="devolucion"
                      value={item.condicionCargadorAnterior}
                      onChange={(v) => actualizar(a.id, { condicionCargadorAnterior: v })}
                      className="field-input field-input-sm mb-2"
                    />
                    <input
                      type="text"
                      value={item.observacionesCargadorAnterior}
                      onChange={(e) =>
                        actualizar(a.id, { observacionesCargadorAnterior: e.target.value })
                      }
                      placeholder="Observación del cargador (opcional)"
                      className="field-input field-input-sm"
                    />
                  </div>
                )}

                {/* Reemplazo: misma categoria, inventario de la sede. */}
                <div>
                  <p className="field-label flex items-center gap-1.5">
                    Nuevo {categoria.toLowerCase()}
                    <ArrowRight className="h-3.5 w-3.5 text-fg-subtle" />
                  </p>
                  {cargando[categoria] || !disponibles[categoria] ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-fg-subtle">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando inventario disponible...
                    </div>
                  ) : opciones.length === 0 && !item.newAssetId ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                      No hay {categoria.toLowerCase()} disponible en esta sede (o ya se eligieron
                      todos para otros equipos). No podrás crear la solicitud hasta que haya stock.
                    </p>
                  ) : (
                    <>
                      <select
                        value={item.newAssetId}
                        onChange={(e) =>
                          actualizar(a.id, { newAssetId: e.target.value, condicionCargadorNuevo: "" })
                        }
                        className="field-input field-input-sm"
                      >
                        <option value="">Seleccionar equipo nuevo...</option>
                        {opciones.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.marca} {d.modelo} · {identificadorActivo(d, "s/serie")}
                            {especificaciones(d) ? ` · ${especificaciones(d)}` : ""}
                          </option>
                        ))}
                      </select>
                      {nuevo && (
                        <div className="mt-2 rounded-lg bg-surface-muted p-2 text-xs text-fg-subtle">
                          {especificaciones(nuevo) || "Sin especificaciones registradas"}
                        </div>
                      )}
                      {nuevo?.tieneCargador && (
                        <div className="mt-2 rounded-lg border border-line bg-surface p-3">
                          <p className="mb-2 text-xs font-medium text-fg-muted">
                            Estado del cargador del equipo nuevo
                          </p>
                          <SelectCondicionCargador
                            contexto="entrega"
                            value={item.condicionCargadorNuevo}
                            onChange={(v) => actualizar(a.id, { condicionCargadorNuevo: v })}
                            className="field-input field-input-sm mb-2"
                          />
                          <input
                            type="text"
                            value={item.observacionesCargadorNuevo}
                            onChange={(e) =>
                              actualizar(a.id, { observacionesCargadorNuevo: e.target.value })
                            }
                            placeholder="Observación del cargador (opcional)"
                            className="field-input field-input-sm"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
