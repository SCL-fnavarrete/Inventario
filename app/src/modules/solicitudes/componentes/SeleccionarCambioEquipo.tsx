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
import { formatearNumero } from "@/modules/lineas";
import {
  especificacionesActivoTexto,
  CONDICION_CARGADOR_POR_DEFECTO,
  type CondicionCargador,
  identificadorActivo,
} from "@/modules/activos";
import { SelectCondicionCargador } from "@/modules/activos/componentes";
import { SelectorBuscable } from "@/shared/ui/SelectorBuscable";
import { CamposMotivoBaja, useMotivosBaja } from "@/modules/mantenciones/componentes";
import { ElegirLineaCelular, SIN_LINEA, type EleccionLinea } from "@/modules/solicitudes/componentes/nueva/ElegirLineaCelular";

type AsignacionActiva = {
  id: string;
  activo: boolean;
  asset: {
    id: string;
    marca: { nombre: string };
    modelo: string;
    numeroSerie: string | null;
    imei?: string | null;
    categoria: { nombre: string; tipoFicha?: string };
    tieneCargador: boolean;
    // Lineas vigentes del equipo: la de un celular puede pasar a eSIM (SPEC 2.166).
    lineas?: { numero: string }[];
  };
};

type ActivoDisponible = {
  id: string;
  marca: { nombre: string };
  modelo: string;
  numeroSerie: string | null;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: { nombre: string } | null;
  imei: string | null;
  lineas?: { numero: string }[];
  pulgadas: string | number | null;
  conectividad: string | null;
  licenciaMicrosoft365: { nombre: string } | null;
  tieneCargador: boolean;
};

type Categoria = { id: string; nombre: string };

// SPEC 2.135: el equipo vuelve en buen estado o dañado; dañado se da de baja
// en el acto con un motivo de la lista. "No devolvió" es solo de la
// desvinculación. ("baja" queda por compatibilidad: es lo mismo que dañado.)
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
  // Con estadoDevolucion "danado": el motivo de la baja y, si es "Otro", su detalle.
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
  // Linea del celular de reemplazo, si llega sin linea (SPEC 2.143).
  lineaNueva: EleccionLinea;
  // Celular: chip fisico (se entrega otro celular) o eSIM (el empleado usa su telefono; SPEC 2.143).
  esCelular: boolean;
  modoCelular: "" | "chip" | "esim";
  esimLineaId: string;
  // eSIM con su misma linea: la del celular que vuelve pasa a eSIM (SPEC 2.166).
  convertirEsim: boolean;
  // Otro celular con su misma linea: el chip del que vuelve pasa al nuevo (SPEC 2.172).
  pasarLinea: boolean;
};

/** Lo que le falta a un equipo marcado, o null si esta completo. */
export function faltaEnCambio(item: ItemCambioEquipo): string | null {
  const faltan = [
    !item.estadoDevolucion && "el estado de devolución",
    item.estadoDevolucion === "danado" && !item.motivoBajaId && "el motivo de la baja",
    item.estadoDevolucion === "danado" && item.motivoPideDetalle && !item.motivoBajaDetalle.trim() && "el detalle del motivo",
    item.esCelular && !item.modoCelular && "si es chip físico o eSIM",
    item.modoCelular !== "esim" && !item.newAssetId && "el reemplazo",
    item.modoCelular === "esim" && !item.esimLineaId && !item.convertirEsim && "la eSIM",
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
  lineaNueva: SIN_LINEA,
  esCelular: false,
  modoCelular: "",
  esimLineaId: "",
  convertirEsim: false,
  pasarLinea: false,
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
  pedidoEsim = null,
  activosElegidos = [],
}: {
  asignacionesActivas: AsignacionActiva[];
  /** Una linea de celular pidio pasar a eSIM: se marca ese celular con eSIM (n cambia en cada pedido). */
  pedidoEsim?: { activoId: string; n: number } | null;
  /** Celulares ya elegidos en la seccion de lineas (eSIM -> chip fisico): no se ofrecen aqui. */
  activosElegidos?: string[];
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

  // Pasar a eSIM desde la linea: se devuelve el celular con su linea (SPEC 2.143).
  const [pedidoVisto, setPedidoVisto] = useState(pedidoEsim?.n);
  if (pedidoEsim && pedidoEsim.n !== pedidoVisto) {
    setPedidoVisto(pedidoEsim.n);
    const asignacion = activas.find((a) => a.asset.id === pedidoEsim.activoId);
    if (asignacion) {
      setItems((prev) => ({
        ...prev,
        [asignacion.id]: {
          ...(prev[asignacion.id] ?? { oldAssignmentId: asignacion.id, ...ITEM_VACIO }),
          esCelular: true,
          modoCelular: "esim",
          newAssetId: "",
          lineaNueva: SIN_LINEA,
          // Con una sola linea, por defecto pasa esa misma a eSIM.
          convertirEsim: asignacion.asset.lineas?.length === 1,
        },
      }));
    }
  }

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
      if (marcado) {
        const esCelular = activas.find((a) => a.id === id)?.asset.categoria.tipoFicha === "celular";
        next[id] = { oldAssignmentId: id, ...ITEM_VACIO, esCelular };
      }
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
        const usados = new Set([
          ...activosElegidos,
          ...Object.values(items)
            .filter((it) => it.oldAssignmentId !== a.id && it.newAssetId)
            .map((it) => it.newAssetId),
        ]);
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
                  {categoria}: {a.asset.marca.nombre} {a.asset.modelo}
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
                  {/* Dañado: se da de baja en el acto con un motivo de la lista (SPEC 2.135). */}
                  {item.estadoDevolucion === "danado" && (
                    <div className="mt-2 space-y-2 rounded-md border border-line bg-surface p-2">
                      <CamposMotivoBaja
                        motivos={motivosBaja}
                        motivoBajaId={item.motivoBajaId}
                        detalle={item.motivoBajaDetalle}
                        onMotivo={(id) =>
                          actualizar(a.id, {
                            motivoBajaId: id,
                            motivoPideDetalle: motivosBaja.find((m) => m.id === id)?.clave === "otro",
                          })
                        }
                        onDetalle={(texto) => actualizar(a.id, { motivoBajaDetalle: texto })}
                        errores={{}}
                      />
                      <p className="text-xs text-fg-subtle">El equipo devuelto queda de baja con este motivo.</p>
                    </div>
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
                  {/* Celular: primero se elige chip físico o eSIM; eSIM no entrega otro celular. */}
                  {item.esCelular && (
                    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
                      {([["chip", "Chip físico"], ["esim", "eSIM"]] as const).map(([modo, titulo]) => (
                        <label key={modo} className={cn("flex cursor-pointer items-center gap-1.5 text-xs", item.modoCelular === modo ? "text-fg" : "text-fg-muted")}>
                          <input
                            type="radio"
                            name={`modo-cambio-${a.id}`}
                            checked={item.modoCelular === modo}
                            onChange={() => {
                              // Marcado desde "Pasar a eSIM" de la linea, el inventario aun no se cargo.
                              if (modo === "chip") cargarCategoria(categoria);
                              actualizar(a.id, {
                                modoCelular: modo,
                                newAssetId: "",
                                condicionCargadorNuevo: "",
                                lineaNueva: SIN_LINEA,
                                pasarLinea: false,
                                esimLineaId: "",
                                // Con una sola linea, por defecto pasa esa misma a eSIM (SPEC 2.166).
                                convertirEsim: modo === "esim" && a.asset.lineas?.length === 1,
                              });
                            }}
                          />
                          {titulo}
                        </label>
                      ))}
                    </div>
                  )}
                  {item.modoCelular === "esim" && (
                    <>
                      {/* Su misma linea pasa a eSIM, u otra eSIM disponible (SPEC 2.166). */}
                      {a.asset.lineas?.length === 1 && (
                        <div className="mb-2 space-y-1">
                          {([[true, `Su misma línea ${formatearNumero(a.asset.lineas[0].numero)}, convertida a eSIM`], [false, "Otra eSIM disponible"]] as const).map(([convertir, titulo]) => (
                            <label key={titulo} className={cn("flex cursor-pointer items-center gap-1.5 text-xs", item.convertirEsim === convertir ? "text-fg" : "text-fg-muted")}>
                              <input
                                type="radio"
                                name={`esim-cambio-${a.id}`}
                                checked={item.convertirEsim === convertir}
                                onChange={() => actualizar(a.id, { convertirEsim: convertir, esimLineaId: "" })}
                              />
                              {titulo}
                            </label>
                          ))}
                        </div>
                      )}
                      {!item.convertirEsim && <ElegirLineaCelular
                        tipo="esim"
                        valor={{ modo: item.esimLineaId ? "fisico" : "ninguna", lineaId: item.esimLineaId }}
                        onChange={(v) => actualizar(a.id, { esimLineaId: v.lineaId })}
                        excluidas={Object.values(items).filter((i) => i.oldAssignmentId !== a.id && i.esimLineaId).map((i) => i.esimLineaId)}
                      />}
                      <p className="mt-1 text-xs text-fg-subtle">
                        {item.convertirEsim
                          ? "El celular se devuelve y el mismo número queda como eSIM con la persona, en su teléfono propio."
                          : "No se entrega otro celular: el empleado usa su teléfono propio."}
                      </p>
                    </>
                  )}
                  {(!item.esCelular || item.modoCelular === "chip") && (cargando[categoria] || !disponibles[categoria] ? (
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
                      {/* Con buscador: se escribe marca, modelo, serie o IMEI y la lista se acorta. */}
                      <SelectorBuscable
                        opciones={opciones}
                        value={item.newAssetId}
                        onChange={(id) =>
                          actualizar(a.id, {
                            newAssetId: id,
                            condicionCargadorNuevo: "",
                            lineaNueva: SIN_LINEA,
                            // Con una sola linea y un celular nuevo sin linea, por defecto pasa ese chip (SPEC 2.172).
                            pasarLinea: a.asset.lineas?.length === 1 && !opciones.find((o) => o.id === id)?.lineas?.length,
                          })
                        }
                        textoDe={(d) => [d.marca.nombre, d.modelo, d.numeroSerie, d.imei, especificaciones(d)]}
                        etiquetaElegida={(d) => `${d.marca.nombre} ${d.modelo} · ${identificadorActivo(d, "s/serie")}`}
                        renderOpcion={(d) => (
                          <>
                            <span className="block font-medium text-fg">
                              {d.marca.nombre} {d.modelo} · {identificadorActivo(d, "s/serie")}
                            </span>
                            {especificaciones(d) && <span className="block text-xs text-fg-subtle">{especificaciones(d)}</span>}
                          </>
                        )}
                        placeholder="Seleccionar equipo nuevo..."
                        buscar="Buscar por marca, modelo, serie o IMEI"
                        vacio="No hay equipos disponibles"
                      />
                      {nuevo && (
                        <div className="mt-2 rounded-lg bg-surface-muted p-2 text-xs text-fg-subtle">
                          {especificaciones(nuevo) || "Sin especificaciones registradas"}
                        </div>
                      )}
                      {/* Un celular que llega sin linea: su mismo chip (SPEC 2.172), otra linea, o sin linea (SPEC 2.160). */}
                      {a.asset.categoria.tipoFicha === "celular" && nuevo && !nuevo.lineas?.length && a.asset.lineas?.length === 1 && (
                        <div className="mt-2 space-y-1">
                          {([[true, `Su misma línea ${formatearNumero(a.asset.lineas[0].numero)}, pasa al celular nuevo`], [false, "Otra línea, o sin línea"]] as const).map(([pasar, titulo]) => (
                            <label key={titulo} className={cn("flex cursor-pointer items-center gap-1.5 text-xs", item.pasarLinea === pasar ? "text-fg" : "text-fg-muted")}>
                              <input
                                type="radio"
                                name={`linea-cambio-${a.id}`}
                                checked={item.pasarLinea === pasar}
                                onChange={() => actualizar(a.id, { pasarLinea: pasar, lineaNueva: SIN_LINEA })}
                              />
                              {titulo}
                            </label>
                          ))}
                          {item.pasarLinea && (
                            <p className="text-xs text-fg-subtle">El celular anterior se devuelve sin chip y el mismo número sigue con la persona en el celular nuevo.</p>
                          )}
                        </div>
                      )}
                      {a.asset.categoria.tipoFicha === "celular" && nuevo && !nuevo.lineas?.length && !item.pasarLinea && (
                        <ElegirLineaCelular
                          valor={item.lineaNueva ?? SIN_LINEA}
                          onChange={(v) => actualizar(a.id, { lineaNueva: v })}
                          aviso={item.lineaNueva?.lineaId ? undefined : "El celular nuevo queda sin línea. Si el anterior tenía una, vuelve con él. Puedes asociarle una después desde Líneas."}
                          excluidas={Object.entries(items).filter(([id]) => id !== a.id).map(([, i]) => i.lineaNueva?.lineaId).filter(Boolean) as string[]}
                        />
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
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
