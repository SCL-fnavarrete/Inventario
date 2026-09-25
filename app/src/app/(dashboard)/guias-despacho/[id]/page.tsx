"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseApiError } from "@/lib/utils/apiErrors";
import { especificacionesActivoTexto } from "@/lib/utils/assetSpecs";
import {
  ESTADO_GUIA_LABELS,
  ESTADO_GUIA_COLORS,
  ESTADO_ITEM_GUIA_LABELS,
  ESTADO_ITEM_GUIA_COLORS,
  type DispatchGuideDetail,
  type DispatchGuideItem,
} from "@/types/guia-despacho";
import {
  ahoraParaInputFechaHora,
  formatearFechaLarga,
  formatearFechaHoraCorta,
  inputFechaHoraAISO,
} from "@/lib/utils/fechas";
import { AvisoSeccion, CampoTexto, ResumenErrores } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { ETIQUETAS_GUIA, validarRecepcion } from "@/lib/validations/guia";
import { puedeAnularGuia, puedeConfirmarRecepcion } from "@/lib/auth/permisosGuia";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { VentanaMotivo } from "@/components/ui/VentanaMotivo";

const BOTON_EXITO = "bg-success hover:bg-success-hover disabled:hover:bg-success";

/**
 * Detalle de una guia de despacho (SPEC 2.108). Los equipos viajan "En
 * transito" hasta que la sede destino confirma cuales llegaron; los que
 * faltan se resuelven despues uno a uno (llego / se perdio). La sede que
 * despacho puede anularla mientras va en transito.
 */
export default function GuiaDespachoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [guide, setGuide] = useState<DispatchGuideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ventanas: recepcion, anular, un faltante que llego o se perdio.
  const [recibiendo, setRecibiendo] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [llego, setLlego] = useState<DispatchGuideItem | null>(null);
  const [perdido, setPerdido] = useState<DispatchGuideItem | null>(null);

  const [recepcion, setRecepcion] = useState({
    recibidoPor: "",
    fechaRecepcion: ahoraParaInputFechaHora(),
    llegaron: [] as string[],
  });
  // Validacion por campo, con las mismas reglas que el servidor.
  const { errores, resumen, reportar, reportarServidor, limpiar } =
    useErroresFormulario(ETIQUETAS_GUIA);

  const fetchGuide = useCallback(async () => {
    try {
      const res = await fetch(`/api/guias-despacho/${id}`);
      if (!res.ok) throw new Error((await parseApiError(res, "Error al cargar la guía")).message);
      setGuide(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la guía");
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
    if (recepcion.llegaron.length === 0) faltan.llegaron = "Marca al menos un equipo que llegó";
    if (reportar(faltan)) return;
    const r = await enviar(
      `/api/guias-despacho/${id}`,
      "PATCH",
      { recibidoPor: recepcion.recibidoPor, fechaRecepcion: fechaISO, llegaron: recepcion.llegaron },
      "Error al confirmar la recepción"
    );
    if (r.ok) setRecibiendo(false);
    else if (!reportarServidor(r.fieldErrors)) setError(r.message);
  }

  async function resolverItem(item: DispatchGuideItem, accion: "llego" | "perdido", motivo?: string) {
    const r = await enviar(
      `/api/guias-despacho/${id}/items/${item.id}`,
      "POST",
      { accion, motivo },
      "Error al resolver el equipo"
    );
    setLlego(null);
    setPerdido(null);
    if (!r.ok) setError(r.message);
  }

  async function anular(motivo: string) {
    const r = await enviar(`/api/guias-despacho/${id}/anular`, "POST", { motivo }, "Error al anular la guía");
    setAnulando(false);
    if (!r.ok) setError(r.message);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-fg-muted">
        <Loader2 className="animate-spin mr-2" />
        Cargando guía...
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="space-y-6">
        <PageHeader backHref="/guias-despacho" title="Guía de despacho" />
        <ResumenErrores mensaje={error ?? "Guía de despacho no encontrada"} />
      </div>
    );
  }

  const sesion = session?.user ? { user: session.user } : null;
  const puedeRecibir = !!sesion && puedeConfirmarRecepcion(sesion, guide);
  const puedeAnular =
    !!sesion &&
    puedeAnularGuia(sesion, guide) &&
    guide.estado === "en_transito" &&
    guide.items.every((i) => i.estado === "en_transito");
  const pendientes = guide.items.filter((i) => i.estado === "en_transito");
  // Los faltantes se resuelven uno a uno despues de la recepcion; "se
  // perdio" tambien antes (por ejemplo, un paquete extraviado).
  const resolverFaltantes = puedeRecibir && (guide.estado === "en_transito" || guide.estado === "recibida_parcial");

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/guias-despacho"
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
                <XCircle size={18} /> Anular guía
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
            Los equipos viajan hacia <strong>{guide.sedeDestino.nombre}</strong>. Siguen en{" "}
            {guide.sede?.nombre ?? "la sede de origen"} hasta que {guide.sedeDestino.nombre} confirme cuáles
            llegaron.
            {!puedeRecibir && ` Solo ${guide.sedeDestino.nombre} puede confirmar la recepción.`}
          </p>
        </div>
      )}
      {guide.estado === "recibida_parcial" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            {pendientes.length === 1 ? "Falta 1 equipo" : `Faltan ${pendientes.length} equipos`}: siguen en
            tránsito. {puedeRecibir ? "Resuélvelos abajo: llegó o se perdió." : `Los resuelve ${guide.sedeDestino.nombre}.`}
          </p>
        </div>
      )}
      {guide.estado === "anulada" && (
        <div className="rounded-lg border border-line bg-surface-muted p-4 text-fg-muted flex gap-3">
          <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Anulada el {formatearFechaHoraCorta(guide.fechaAnulacion, "-")} por {guide.anuladaPor ?? "-"}:{" "}
            {guide.motivoAnulacion}. Los equipos volvieron a Disponible en {guide.sede?.nombre ?? "su sede"}.
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
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package className="text-primary-700" size={20} />
          Equipos ({guide.items.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-surface-muted">
              <tr>
                <th className="table-th px-4 hidden md:table-cell">Tipo</th>
                <th className="table-th px-4">
                  <span className="md:hidden">Equipo</span>
                  <span className="hidden md:inline">Marca / Modelo</span>
                </th>
                <th className="table-th px-4 hidden md:table-cell">N° Serie</th>
                <th className="table-th px-4 hidden md:table-cell">Especificaciones</th>
                <th className="table-th px-4">Estado</th>
                {resolverFaltantes && <th className="table-th px-4 text-right hidden md:table-cell">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {guide.items.map((item) => {
                const asset = item.asset;
                // "Llegó" / "Se perdió": en escritorio en su columna; en
                // celular bajo el equipo, a lo ancho y faciles de tocar.
                const acciones = (clase: string) =>
                  resolverFaltantes && item.estado === "en_transito" ? (
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
                        className={buttonClasses({
                          size: "sm",
                          variant: "outline",
                          className: "text-red-600 border-red-300 flex-1 md:flex-none whitespace-nowrap",
                        })}
                      >
                        Se perdió
                      </button>
                    </div>
                  ) : null;
                return (
                  <tr key={item.id} className="hover:bg-surface-muted">
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-2">
                        <CategoryIcon categoria={asset.categoria.nombre} className="h-5 w-5 text-fg-subtle" />
                        <span className="text-sm">{asset.categoria.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/activos/${asset.id}`} className="font-medium hover:text-primary-700">
                        {asset.marca} {asset.modelo}
                      </Link>
                      <div className="md:hidden text-xs text-fg-muted font-mono break-all">
                        {asset.numeroSerie || asset.imei || "-"}
                      </div>
                      {acciones("md:hidden mt-2 flex gap-2")}
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted font-mono hidden md:table-cell">
                      {asset.numeroSerie || asset.imei || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted hidden md:table-cell">
                      {especificacionesActivoTexto(asset) || "-"}
                    </td>
                    <td className="px-4 py-3 align-top md:align-middle">
                      <span
                        className={cn("inline-flex px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap", ESTADO_ITEM_GUIA_COLORS[item.estado])}
                        title={item.estado === "perdido" ? item.observaciones ?? undefined : undefined}
                      >
                        {ESTADO_ITEM_GUIA_LABELS[item.estado]}
                      </span>
                    </td>
                    {resolverFaltantes && (
                      <td className="px-4 py-3 text-right whitespace-nowrap hidden md:table-cell">
                        {acciones("flex justify-end gap-2")}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
          <div>
            <p className="field-label">Marca los equipos que llegaron *</p>
            <AvisoSeccion mensaje={errores.llegaron} className="mb-2" />
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
                      <span className="text-fg-subtle font-mono">{item.asset.numeroSerie ?? ""}</span>
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
          <div className="flex justify-end gap-2">
            <button onClick={() => setRecibiendo(false)} className={buttonClasses({ variant: "outline" })}>
              Volver
            </button>
            <button onClick={confirmarRecepcion} disabled={updating} className={buttonClasses({ className: BOTON_EXITO })}>
              {updating ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
              Confirmar {recepcion.llegaron.length} de {guide.items.length}
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
            ? `${perdido.asset.marca} ${perdido.asset.modelo} se da de baja por Extravío. Queda registrado como una mantención "Sin reparación".`
            : undefined
        }
        etiqueta="Qué pasó"
        mensajeVacio="Escribe qué pasó con el equipo"
        placeholder="Ej: Chilexpress confirmó que el paquete se extravió..."
        textoConfirmar="Dar de baja por extravío"
        variante="danger"
        cargando={updating}
      />
      <VentanaMotivo
        isOpen={anulando}
        onClose={() => setAnulando(false)}
        onConfirm={anular}
        titulo="Anular guía"
        descripcion={`Los ${guide.items.length} equipos vuelven a Disponible en ${guide.sede?.nombre ?? "la sede de origen"}. La guía queda anulada.`}
        placeholder="Ej: El paquete no salió, se envió a la sede equivocada..."
        textoConfirmar="Anular guía"
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
