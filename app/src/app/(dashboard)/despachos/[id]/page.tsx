"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  Loader2,
  Package,
  MapPin,
  User,
  Calendar,
  FileText,
  CheckCircle,
  XCircle,
  Truck,
  AlertTriangle,
  Shirt,
} from "lucide-react";
import { cn } from "@/shared/cn";
import { parseApiError } from "@/shared/utilidades/apiErrors";
import { especificacionesActivoTexto, identificadorActivo } from "@/modules/activos";
import {
  ESTADO_GUIA_LABELS,
  ESTADO_GUIA_COLORS,
  ESTADO_ITEM_GUIA_LABELS,
  ESTADO_ITEM_GUIA_COLORS,
  pendienteKit,
  type DispatchGuideDetail,
  type DispatchGuideItem,
  type DispatchGuideKitLine,
  ETIQUETAS_GUIA,
  validarRecepcion,
} from "@/modules/despachos";
import {
  ahoraParaInputFechaHora,
  formatearFechaLarga,
  formatearFechaHoraCorta,
  inputFechaHoraAISO,
} from "@/shared/utilidades/fechas";
import { AvisoSeccion, CampoTexto, ResumenErrores } from "@/shared/ui/CampoFormulario";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { CategoryIcon } from "@/modules/activos/componentes";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Modal } from "@/shared/ui/Modal";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { VentanaMotivo } from "@/shared/ui/VentanaMotivo";
import { VentanaKitDespacho, type AccionKitDespacho } from "@/modules/despachos/componentes";

const BOTON_EXITO = "bg-success hover:bg-success-hover disabled:hover:bg-success";

/**
 * Detalle de una guia de despacho (SPEC 2.108). Los equipos viajan "En
 * transito" hasta que la sede destino confirma cuales llegaron; los que
 * faltan se resuelven despues uno a uno (llego / se perdio). La sede que
 * despacho puede anularla mientras va en transito.
 */
export default function GuiaDespachoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = usePermissions();
  const [guide, setGuide] = useState<DispatchGuideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ventanas: recepcion, anular, un faltante que llego o se perdio.
  const [recibiendo, setRecibiendo] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [llego, setLlego] = useState<DispatchGuideItem | null>(null);
  const [perdido, setPerdido] = useState<DispatchGuideItem | null>(null);
  // Un equipo que se dio por perdido y aparecio (SPEC 2.111.4).
  const [aparecio, setAparecio] = useState<DispatchGuideItem | null>(null);
  // Kit/EPP: una linea y lo que se resuelve de ella.
  const [kitVentana, setKitVentana] = useState<{ linea: DispatchGuideKitLine; accion: AccionKitDespacho } | null>(
    null
  );

  const [recepcion, setRecepcion] = useState({
    recibidoPor: "",
    fechaRecepcion: ahoraParaInputFechaHora(),
    llegaron: [] as string[],
    // Unidades de Kit/EPP que llegaron, por linea.
    kit: {} as Record<string, string>,
  });
  // Validacion por campo, con las mismas reglas que el servidor.
  const { errores, resumen, reportar, reportarServidor, limpiar } =
    useErroresFormulario(ETIQUETAS_GUIA);

  const fetchGuide = useCallback(async () => {
    try {
      const res = await fetch(`/api/guias-despacho/${id}`);
      if (!res.ok) throw new Error((await parseApiError(res, "Error al cargar el despacho")).message);
      setGuide(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el despacho");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGuide();
  }, [fetchGuide]);

  /** Envia una accion y refresca la guia con lo que devuelve el servidor. */
  async function enviar(url: string, method: string, body: unknown, fallback: string) {
    setUpdating(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return { ok: false as const, ...(await parseApiError(res, fallback)) };
      setGuide(await res.json());
      return { ok: true as const };
    } catch {
      return { ok: false as const, message: fallback, fieldErrors: {} };
    } finally {
      setUpdating(false);
    }
  }

  function abrirRecepcion() {
    if (!guide) return;
    // Parte con el receptor de la guia y todos los equipos marcados.
    setRecepcion({
      recibidoPor: guide.receptorNombre,
      fechaRecepcion: ahoraParaInputFechaHora(),
      llegaron: guide.items.map((i) => i.id),
      // Parte con todo lo enviado; se corrige si llego menos.
      kit: Object.fromEntries(guide.kitItems.map((k) => [k.id, String(k.cantidad)])),
    });
    reportar({});
    setRecibiendo(true);
  }

  async function confirmarRecepcion() {
    if (!guide) return;
    const fechaISO = inputFechaHoraAISO(recepcion.fechaRecepcion);
    const faltan = validarRecepcion(
      { recibidoPor: recepcion.recibidoPor, fechaRecepcion: fechaISO },
      guide.fechaDespacho
    );
    const kitRecibido = guide.kitItems.map((k) => ({
      lineaId: k.id,
      cantidad: parseInt(recepcion.kit[k.id] || "0", 10) || 0,
      linea: k,
    }));
    const excedida = kitRecibido.find((k) => k.cantidad > k.linea.cantidad || k.cantidad < 0);
    if (excedida) faltan.kit = `De ${excedida.linea.item.nombre} se enviaron ${excedida.linea.cantidad}`;
    if (recepcion.llegaron.length === 0 && kitRecibido.every((k) => k.cantidad === 0)) {
      faltan.llegaron =
        guide.kitItems.length > 0
          ? "Marca al menos un equipo o una cantidad de Kit/EPP que llegó"
          : "Marca al menos un equipo que llegó";
    }
    if (reportar(faltan)) return;
    const r = await enviar(
      `/api/guias-despacho/${id}`,
      "PATCH",
      {
        recibidoPor: recepcion.recibidoPor,
        fechaRecepcion: fechaISO,
        llegaron: recepcion.llegaron,
        kitRecibido: kitRecibido.filter((k) => k.cantidad > 0).map(({ lineaId, cantidad }) => ({ lineaId, cantidad })),
      },
      "Error al confirmar la recepción"
    );
    if (r.ok) setRecibiendo(false);
    else if (!reportarServidor(r.fieldErrors)) setError(r.message);
  }

  async function resolverItem(item: DispatchGuideItem, accion: "llego" | "perdido" | "aparecio", motivo?: string) {
    const r = await enviar(
      `/api/guias-despacho/${id}/items/${item.id}`,
      "POST",
      { accion, motivo },
      "Error al resolver el equipo"
    );
    setLlego(null);
    setPerdido(null);
    setAparecio(null);
    if (!r.ok) setError(r.message);
  }

  /** Llego, se perdio o aparecio Kit/EPP de una linea. */
  async function resolverKitLinea(cantidad: number, motivo: string) {
    if (!kitVentana) return;
    const r = await enviar(
      `/api/guias-despacho/${id}/kit/${kitVentana.linea.id}`,
      "POST",
      { accion: kitVentana.accion, cantidad, motivo },
      "Error al resolver el Kit/EPP"
    );
    if (r.ok) {
      setKitVentana(null);
      return;
    }
    // Los errores de cantidad o motivo se marcan en la ventana.
    if (Object.keys(r.fieldErrors).length > 0) return r.fieldErrors;
    setKitVentana(null);
    setError(r.message);
  }

  async function anular(motivo: string) {
    const r = await enviar(`/api/guias-despacho/${id}/anular`, "POST", { motivo }, "Error al anular el despacho");
    setAnulando(false);
    if (!r.ok) setError(r.message);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-fg-muted">
        <Loader2 className="animate-spin mr-2" />
        Cargando despacho...
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="space-y-6">
        <PageHeader backHref="/despachos" title="Despacho" />
        <ResumenErrores mensaje={error ?? "Despacho no encontrado"} />
      </div>
    );
  }

  // Cualquier sede recibe y anula (SPEC 2.117): lo decide el permiso, no la sede.
  const puedeRecibir = can("guias", "write");
  const puedeAnular =
    puedeRecibir &&
    guide.estado === "en_transito" &&
    guide.items.every((i) => i.estado === "en_transito") &&
    guide.kitItems.every((k) => k.cantidadRecibida === 0 && k.cantidadPerdida === 0);
  const pendientes = guide.items.filter((i) => i.estado === "en_transito");
  const kitPendiente = guide.kitItems.reduce((s, k) => s + pendienteKit(k), 0);
  // Los faltantes se resuelven uno a uno despues de la recepcion; "se
  // perdio" tambien antes (por ejemplo, un paquete extraviado).
  const resolverFaltantes = puedeRecibir && (guide.estado === "en_transito" || guide.estado === "recibida_parcial");
  // "Aparecio" tambien en un despacho ya recibido (SPEC 2.111.4).
  const mostrarAcciones = puedeRecibir && guide.estado !== "anulada";
  // Una fila tiene boton si el equipo se perdio ("Apareció") o sigue en
  // camino ("Llegó" / "Se perdió"). La columna solo sale si alguna fila lo tiene.
  const accionEquipo = (i: (typeof guide.items)[number]) =>
    mostrarAcciones && (i.estado === "perdido" || (resolverFaltantes && i.estado === "en_transito"));
  const accionKit = (k: (typeof guide.kitItems)[number]) =>
    mostrarAcciones && (k.cantidadPerdida > 0 || (resolverFaltantes && pendienteKit(k) > 0));
  const columnaEquipos = guide.items.some(accionEquipo);
  const columnaKit = guide.kitItems.some(accionKit);

  // "Llegó" / "Se perdió" / "Apareció" de un equipo: en escritorio en su columna;
  // en celular bajo el equipo, a lo ancho y faciles de tocar.
  const botonesItem = (item: (typeof guide.items)[number], clase: string) =>
    mostrarAcciones && item.estado === "perdido" ? (
      <div className={clase}>
        <button
          onClick={() => setAparecio(item)}
          className={buttonClasses({ size: "sm", variant: "outline", className: "flex-1 md:flex-none whitespace-nowrap" })}
        >
          Apareció
        </button>
      </div>
    ) : resolverFaltantes && item.estado === "en_transito" ? (
      <div className={clase}>
        {guide.estado === "recibida_parcial" && (
          <button
            onClick={() => setLlego(item)}
            className={buttonClasses({ size: "sm", className: cn(BOTON_EXITO, "flex-1 md:flex-none whitespace-nowrap") })}
          >
            Llegó
          </button>
        )}
        <button
          onClick={() => setPerdido(item)}
          className={buttonClasses({ size: "sm", variant: "outline", className: "text-red-600 border-red-300 flex-1 md:flex-none whitespace-nowrap" })}
        >
          Se perdió
        </button>
      </div>
    ) : null;
  const deReparto = !!guide.purchaseId;
  const faltantesTexto = [
    pendientes.length > 0 && (pendientes.length === 1 ? "1 equipo" : `${pendientes.length} equipos`),
    kitPendiente > 0 && `${kitPendiente} unidad(es) de Kit/EPP`,
  ]
    .filter(Boolean)
    .join(" y ");

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/despachos"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {guide.numero}
            <span className={cn("px-3 py-1 text-sm font-medium rounded-full", ESTADO_GUIA_COLORS[guide.estado])}>
              {ESTADO_GUIA_LABELS[guide.estado]}
            </span>
          </span>
        }
        description={`Creada el ${formatearFechaHoraCorta(guide.createdAt, "-")}`}
        actions={
          <>
            {guide.estado === "en_transito" && puedeRecibir && (
              <button onClick={abrirRecepcion} className={buttonClasses({ className: BOTON_EXITO })}>
                <CheckCircle size={18} /> Confirmar recepción
              </button>
            )}
            {puedeAnular && (
              <button
                onClick={() => setAnulando(true)}
                className={buttonClasses({ variant: "outline", className: "text-red-600 border-red-300" })}
              >
                <XCircle size={18} /> Anular despacho
              </button>
            )}
          </>
        }
      />

      <ResumenErrores mensaje={error ?? undefined} />

      {/* Qué está pasando con la guía */}
      {guide.estado === "en_transito" && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sky-900 flex gap-3">
          <Truck className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Lo despachado viaja hacia <strong>{guide.sedeDestino.nombre}</strong>. Sigue en{" "}
            {guide.sede?.nombre ?? "la sede de origen"} hasta que {guide.sedeDestino.nombre} confirme qué
            llegó.
          </p>
        </div>
      )}
      {guide.estado === "recibida_parcial" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Falta: {faltantesTexto}, en tránsito.{" "}
            {puedeRecibir && "Resuélvelo abajo: llegó o se perdió."}
          </p>
        </div>
      )}
      {guide.estado === "anulada" && (
        <div className="rounded-lg border border-line bg-surface-muted p-4 text-fg-muted flex gap-3">
          <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Anulado el {formatearFechaHoraCorta(guide.fechaAnulacion, "-")} por {guide.anuladaPor ?? "-"}:{" "}
            {guide.motivoAnulacion}.{" "}
            {deReparto
              ? "Lo despachado volvió a Por repartir en su compra."
              : `Los equipos volvieron a Disponible en ${guide.sede?.nombre ?? "su sede"}.`}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MapPin className="text-primary-700" size={20} />
            Datos del Despacho
          </h2>
          <dl className="space-y-3">
            <Dato label="OT Chilexpress"><span className="font-mono">{guide.otChilexpress}</span></Dato>
            <Dato label="Sede origen">{guide.sede?.nombre || "—"}</Dato>
            <Dato label="Sede destino">{guide.sedeDestino.nombre}</Dato>
            <Dato label="Emisor">{guide.despachadoPor}</Dato>
            <Dato label="Fecha de envío">{formatearFechaHoraCorta(guide.fechaDespacho, "-")}</Dato>
            <Dato label="Fecha estimada de llegada">{formatearFechaLarga(guide.fechaEstimadaLlegada, "-")}</Dato>
            {guide.purchase && (
              <Dato label="Reparto de la compra">
                <Link href={`/compras/${guide.purchase.id}`} className="text-primary-700 hover:underline">
                  Factura {guide.purchase.numeroFactura ?? "sin número"}
                </Link>
              </Dato>
            )}
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="text-primary-700" size={20} />
            Receptor
          </h2>
          <dl className="space-y-3">
            <Dato label="Nombre">{guide.receptorNombre}</Dato>
            <Dato label="RUT">{guide.receptorRut}</Dato>
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="text-primary-700" size={20} />
            Recepción
          </h2>
          <dl className="space-y-3">
            <Dato label="Estado">
              <span className={cn("inline-flex px-2 py-1 text-sm font-medium rounded-full", ESTADO_GUIA_COLORS[guide.estado])}>
                {ESTADO_GUIA_LABELS[guide.estado]}
              </span>
            </Dato>
            <Dato label="Fecha de recepción">{formatearFechaHoraCorta(guide.fechaRecepcion, "Aún no se recibe")}</Dato>
            {guide.recibidoPor && <Dato label="Recibido por">{guide.recibidoPor}</Dato>}
          </dl>
        </div>
      </div>

      {guide.observaciones && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="text-primary-700" size={20} />
            Observaciones
          </h2>
          <p className="text-fg-muted whitespace-pre-wrap">{guide.observaciones}</p>
        </div>
      )}

      {/* Equipos, cada uno con su estado */}
      {guide.items.length > 0 && (
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package className="text-primary-700" size={20} />
          Equipos ({guide.items.length})
        </h2>
        <TablaDatos
          sinMarco
          compacta
          items={guide.items}
          clave={(item) => item.id}
          vacio="Sin equipos"
          columnas={[
            {
              titulo: "Tipo",
              className: "hidden px-4 md:table-cell",
              celda: ({ asset }) => (
                <div className="flex items-center gap-2">
                  <CategoryIcon categoria={asset.categoria.nombre} className="h-5 w-5 text-fg-subtle" />
                  <span className="text-sm">{asset.categoria.nombre}</span>
                </div>
              ),
            },
            {
              titulo: (
                <>
                  <span className="md:hidden">Equipo</span>
                  <span className="hidden md:inline">Marca / Modelo</span>
                </>
              ),
              className: "px-4",
              celda: (item) => (
                <>
                  <Link href={`/activos/${item.asset.id}`} className="font-medium hover:text-primary-700">
                    {item.asset.marca} {item.asset.modelo}
                  </Link>
                  <div className="break-all font-mono text-xs text-fg-muted md:hidden">{identificadorActivo(item.asset, "-")}</div>
                  {botonesItem(item, "md:hidden mt-2 flex gap-2")}
                </>
              ),
            },
            { titulo: "N° Serie", className: "hidden px-4 font-mono text-fg-muted md:table-cell", celda: ({ asset }) => identificadorActivo(asset, "-") },
            { titulo: "Especificaciones", className: "hidden px-4 text-fg-muted md:table-cell", celda: ({ asset }) => especificacionesActivoTexto(asset) || "-" },
            {
              titulo: "Estado",
              className: "px-4 align-top md:align-middle",
              celda: (item) => (
                <span
                  className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium", ESTADO_ITEM_GUIA_COLORS[item.estado])}
                  title={item.estado === "perdido" ? item.observaciones ?? undefined : undefined}
                >
                  {ESTADO_ITEM_GUIA_LABELS[item.estado]}
                </span>
              ),
            },
            ...(columnaEquipos
              ? [
                  {
                    titulo: "Acciones",
                    sinSalto: true,
                    className: "hidden px-4 text-right md:table-cell",
                    celda: (item: (typeof guide.items)[number]) => botonesItem(item, "flex justify-end gap-2"),
                  },
                ]
              : []),
          ]}
        />
      </div>
      )}

      {/* Kit/EPP del despacho (SPEC 2.111.4) */}
      {guide.kitItems.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shirt className="text-primary-700" size={20} />
            Kit/EPP ({guide.kitItems.length})
          </h2>
          <TablaDatos
            sinMarco
            compacta
            items={guide.kitItems}
            clave={(k) => k.id}
            vacio="Sin artículos"
            columnas={[
              {
                titulo: "Artículo",
                className: "px-4",
                celda: (k) => (
                  <>
                    <p className="text-sm font-medium">{k.item.nombre}</p>
                    <p className="text-xs text-fg-subtle">
                      {k.item.categoria === "epp" ? "EPP" : "Kit Bienvenida"}
                      <span className="sm:hidden">
                        {" "}• recibido {k.cantidadRecibida}
                        {k.cantidadPerdida > 0 && `, perdido ${k.cantidadPerdida}`}
                      </span>
                    </p>
                    {k.motivoPerdida && (
                      <p className="text-xs text-red-700" title="Perdido">
                        Perdido: {k.motivoPerdida}
                      </p>
                    )}
                  </>
                ),
              },
              { titulo: "Enviado", className: "px-4 text-center", celda: (k) => k.cantidad },
              { titulo: "Recibido", className: "hidden px-4 text-center sm:table-cell", celda: (k) => k.cantidadRecibida },
              {
                titulo: "Perdido",
                className: "hidden px-4 text-center sm:table-cell",
                celda: (k) => <span className={k.cantidadPerdida > 0 ? "font-medium text-red-700" : ""}>{k.cantidadPerdida}</span>,
              },
              {
                titulo: "Pendiente",
                className: "px-4 text-center",
                celda: (k) => {
                  const pendiente = pendienteKit(k);
                  return <span className={pendiente > 0 ? "font-medium text-sky-700" : "text-fg-subtle"}>{pendiente}</span>;
                },
              },
              ...(columnaKit
                ? [
                    {
                      titulo: "Acciones",
                      className: "px-4 text-right",
                      celda: (k: (typeof guide.kitItems)[number]) => {
                        const pendiente = pendienteKit(k);
                        const abrir = (accion: AccionKitDespacho) => setKitVentana({ linea: k, accion });
                        return (
                          <div className="flex flex-wrap justify-end gap-2">
                            {pendiente > 0 && guide.estado === "recibida_parcial" && (
                              <button onClick={() => abrir("llego")} className={buttonClasses({ size: "sm", className: cn(BOTON_EXITO, "whitespace-nowrap") })}>
                                Llegó
                              </button>
                            )}
                            {pendiente > 0 && resolverFaltantes && (
                              <button
                                onClick={() => abrir("perdido")}
                                className={buttonClasses({ size: "sm", variant: "outline", className: "whitespace-nowrap border-red-300 text-red-600" })}
                              >
                                Se perdió
                              </button>
                            )}
                            {k.cantidadPerdida > 0 && (
                              <button onClick={() => abrir("aparecio")} className={buttonClasses({ size: "sm", variant: "outline", className: "whitespace-nowrap" })}>
                                Apareció
                              </button>
                            )}
                          </div>
                        );
                      },
                    },
                  ]
                : []),
            ]}
          />
        </div>
      )}

      {/* Confirmar recepción: se marcan los equipos que llegaron */}
      <Modal isOpen={recibiendo} onClose={() => setRecibiendo(false)} title="Confirmar recepción" size="lg">
        <div className="space-y-4">
          <ResumenErrores mensaje={resumen} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <CampoTexto
              label="Recibido por"
              obligatorio
              value={recepcion.recibidoPor}
              onChange={(v) => {
                setRecepcion((prev) => ({ ...prev, recibidoPor: v }));
                limpiar("recibidoPor");
              }}
              error={errores.recibidoPor}
            />
            <CampoTexto
              label="Fecha de recepción"
              type="datetime-local"
              value={recepcion.fechaRecepcion}
              onChange={(v) => {
                setRecepcion((prev) => ({ ...prev, fechaRecepcion: v }));
                limpiar("fechaRecepcion");
              }}
              error={errores.fechaRecepcion}
            />
          </div>
          <AvisoSeccion mensaje={errores.llegaron} />
          {guide.items.length > 0 && (
          <div>
            <p className="field-label">Marca los equipos que llegaron</p>
            <ul className="border border-line rounded-lg divide-y divide-line max-h-72 overflow-y-auto">
              {guide.items.map((item) => (
                <li key={item.id}>
                  <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-muted">
                    <input
                      type="checkbox"
                      className="field-checkbox"
                      checked={recepcion.llegaron.includes(item.id)}
                      onChange={(e) => {
                        limpiar("llegaron");
                        setRecepcion((prev) => ({
                          ...prev,
                          llegaron: e.target.checked
                            ? [...prev.llegaron, item.id]
                            : prev.llegaron.filter((x) => x !== item.id),
                        }));
                      }}
                    />
                    <CategoryIcon categoria={item.asset.categoria.nombre} className="h-4 w-4 text-fg-subtle" />
                    <span className="text-sm">
                      <span className="font-medium">{item.asset.marca} {item.asset.modelo}</span>{" "}
                      <span className="text-fg-subtle font-mono">{identificadorActivo(item.asset, "")}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-xs text-fg-subtle mt-1">
              Los que llegaron pasan a {guide.sedeDestino.nombre} como Disponibles. Los que no, siguen en tránsito y
              se resuelven después.
            </p>
          </div>
          )}
          {guide.kitItems.length > 0 && (
            <div>
              <p className="field-label">Cuánto Kit/EPP llegó</p>
              <ul className="border border-line rounded-lg divide-y divide-line">
                {guide.kitItems.map((k) => (
                  <li key={k.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 text-sm">
                      {k.item.nombre}
                      <span className="block text-xs text-fg-subtle">Se enviaron {k.cantidad}</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={k.cantidad}
                      inputMode="numeric"
                      aria-label={`Llegaron de ${k.item.nombre}`}
                      value={recepcion.kit[k.id] ?? ""}
                      onChange={(e) => {
                        limpiar("kit");
                        limpiar("llegaron");
                        setRecepcion((prev) => ({ ...prev, kit: { ...prev.kit, [k.id]: e.target.value } }));
                      }}
                      className="field-input field-input-sm w-24 text-center"
                    />
                  </li>
                ))}
              </ul>
              <AvisoSeccion mensaje={errores.kit} />
              <p className="text-xs text-fg-subtle mt-1">
                Se suma al stock de {guide.sedeDestino.nombre}. Lo que no llegó queda pendiente y se resuelve después.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => setRecibiendo(false)} className={buttonClasses({ variant: "outline" })}>
              Volver
            </button>
            <button onClick={confirmarRecepcion} disabled={updating} className={buttonClasses({ className: BOTON_EXITO })}>
              {updating ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
              Confirmar recepción
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={llego !== null}
        onClose={() => setLlego(null)}
        onConfirm={() => {
          if (llego) return resolverItem(llego, "llego");
        }}
        variant="info"
        title="Confirmar que llegó"
        message={llego ? `${llego.asset.marca} ${llego.asset.modelo} pasa a ${guide.sedeDestino.nombre} como Disponible.` : ""}
        confirmLabel="Llegó"
        cancelLabel="Volver"
        loading={updating}
      />
      <VentanaMotivo
        isOpen={perdido !== null}
        onClose={() => setPerdido(null)}
        onConfirm={(motivo) => {
          if (perdido) return resolverItem(perdido, "perdido", motivo);
        }}
        titulo="Marcar como perdido"
        descripcion={
          perdido
            ? `${perdido.asset.marca} ${perdido.asset.modelo} se da de baja por Extravío, con el motivo que escribas.`
            : undefined
        }
        etiqueta="Qué pasó"
        mensajeVacio="Escribe qué pasó con el equipo"
        placeholder="Ej: Chilexpress confirmó que el paquete se extravió..."
        textoConfirmar="Dar de baja por extravío"
        variante="danger"
        cargando={updating}
      />
      <ConfirmDialog
        isOpen={aparecio !== null}
        onClose={() => setAparecio(null)}
        onConfirm={() => {
          if (aparecio) return resolverItem(aparecio, "aparecio");
        }}
        variant="info"
        title="El equipo apareció"
        message={
          aparecio
            ? `${aparecio.asset.marca} ${aparecio.asset.modelo} sale de la baja por extravío y queda Disponible en ${guide.sedeDestino.nombre}. La mantención de la baja queda como registro.`
            : ""
        }
        confirmLabel="Apareció"
        cancelLabel="Volver"
        loading={updating}
      />
      <VentanaKitDespacho
        abierto={
          kitVentana
            ? {
                accion: kitVentana.accion,
                nombre: kitVentana.linea.item.nombre,
                maximo:
                  kitVentana.accion === "aparecio" ? kitVentana.linea.cantidadPerdida : pendienteKit(kitVentana.linea),
              }
            : null
        }
        sedeDestino={guide.sedeDestino.nombre}
        cargando={updating}
        onClose={() => setKitVentana(null)}
        onConfirm={resolverKitLinea}
      />
      <VentanaMotivo
        isOpen={anulando}
        onClose={() => setAnulando(false)}
        onConfirm={anular}
        titulo="Anular despacho"
        descripcion={
          deReparto
            ? "Lo despachado vuelve a Por repartir en su compra, para repartirlo de nuevo. El despacho queda anulado."
            : `Los ${guide.items.length} equipos vuelven a Disponible en ${guide.sede?.nombre ?? "la sede de origen"}. El despacho queda anulado.`
        }
        placeholder="Ej: El paquete no salió, se envió a la sede equivocada..."
        textoConfirmar="Anular despacho"
        variante="danger"
        cargando={updating}
      />
    </div>
  );
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-fg-subtle">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
