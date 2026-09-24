'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MessageSquare,
  Clock,
  Send,
  ChevronRight,
  CheckCircle,
  Circle,
  User,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseApiError, type FieldErrors } from '@/lib/utils/apiErrors';
import { ApiErrorSummary } from '@/components/ui/ApiErrorSummary';
import { formatearFecha } from "@/lib/utils/fechas";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { FilaEquipoTicket, type AsignacionFila } from '@/components/solicitudes/FilaEquipoTicket';

type WorkflowDetail = {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
  /**
   * Sede this request belongs to; determines which warehouse's stock is
   * offered when executing it (not the screen-level sede filter selector).
   */
  sedeId: string | null;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
  fechaCierre: string | null;
  // Onboarding
  fechaIngreso: string | null;
  cargoSolicitado: string | null;
  ubicacionDestino: string | null;
  categoriasRequeridas: string[];
  kitBienvenidaSolicitado: boolean;
  eppSolicitado: boolean;
  fechaEntregaCoordinada: string | null;
  medioEntrega: string | null;
  lugarEntrega: string | null;
  otChilexpressEntrega: string | null;
  ciudadEntrega: string | null;
  // Cambio
  motivoCambio: string | null;
  medioCambio: string | null;
  fechaCambioCoordinada: string | null;
  lugarCambio: string | null;
  otCambioChilexpress: string | null;
  ciudadCambio: string | null;
  // Devolucion
  fechaDesvinculacion: string | null;
  medioDevolucion: string | null;
  otChilexpress: string | null;
  ciudadDevolucion: string | null;
  fechaDevolucionCoordinada: string | null;
  lugarDevolucion: string | null;
  // References
  assignmentIds: string[];
  kitReturnIds: string[];
  dispatchGuideId: string | null;
  employee: {
    id: string;
    rut: string | null;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    cargo: string | null;
    correoPersonal: string;
    assignments: { id: string; activo: boolean; estadoDevolucion: string | null; asset: { id: string; marca: string; modelo: string; numeroSerie: string | null; categoria: { nombre: string }; tieneCargador: boolean } }[];
    // EPP entregado y aun no devuelto (offboarding). El Kit de Bienvenida
    // no aparece aca -- es consumible, no se devuelve.
    kitAssignments: { id: string; estado: string; item: { id: string; nombre: string; categoria: 'kit_bienvenida' | 'epp' } }[];
  };
  solicitante: { id: string; nombre: string; rol: string };
  responsableActual: { id: string; nombre: string; rol: string } | null;
  comments: {
    id: string;
    mensaje: string;
    esInterno: boolean;
    createdAt: string;
    autor: { id: string; nombre: string; rol: string };
  }[];
  transitions: {
    id: string;
    estadoAnterior: string;
    estadoNuevo: string;
    comentario: string | null;
    createdAt: string;
    ejecutadoPor: { id: string; nombre: string; rol: string };
  }[];
  pendientes: {
    id: string;
    tipo: string;
    estado: string;
    descripcion: string | null;
    actualizadoPor: string | null;
    updatedAt: string;
  }[];
  kitAssignments: {
    id: string;
    cantidad: number;
    estado: string;
    createdAt: string;
    item: { id: string; nombre: string; categoria: 'kit_bienvenida' | 'epp' };
  }[];
  // Equipos de ESTE ticket (assignmentIds), no los que el empleado tiene hoy:
  // lo entregado en un onboarding y lo devuelto en una desvinculacion.
  equiposEntregados: AsignacionFila[];
  equiposDevueltos: AsignacionFila[];
  // Mismo caso para el EPP devuelto en este ticket (ver kitReturnIds).
  eppDevueltos: {
    id: string;
    estado: string;
    observaciones: string | null;
    item: { id: string; nombre: string; categoria: 'kit_bienvenida' | 'epp' };
  }[];
  // Detalle articulo-por-articulo de lo requerido en el onboarding (Kit de
  // Bienvenida / EPP). Si esta vacio, el ticket es de antes de esta
  // funcionalidad y se sigue usando el chequeo por categoria (booleanos).
  kitRequeridos: {
    id: string;
    cantidad: number;
    estado: 'pendiente' | 'entregado' | 'no_aplica';
    motivoNoAplica: string | null;
    item: { id: string; nombre: string; categoria: 'kit_bienvenida' | 'epp' };
  }[];
  // Cambio de equipo: un par por cada equipo cambiado (SPEC 2.84), con el
  // equipo devuelto y su reemplazo, ya armados por el backend.
  paresCambio: { anterior: AsignacionFila | null; nuevo: AsignacionFila | null }[];
};

const estadoLabels: Record<string, string> = {
  solicitud_recibida: 'Solicitud Recibida',
  gestion_ti: 'Gestión TI',
  equipos_entregados: 'Equipos Entregados',
  registro_rrhh: 'Ticket Cerrado',
  incidencia_detectada: 'Incidencia Detectada',
  cambio_ejecutado: 'Cambio Ejecutado',
  confirmacion_rrhh: 'Ticket Cerrado',
  solicitud_emitida: 'Solicitud Emitida',
  equipo_recibido: 'Equipo Recibido',
  consolidacion_cierre: 'Consolidación y Cierre',
};

const tipoLabels: Record<string, string> = {
  onboarding: 'Onboarding',
  cambio_equipo: 'Cambio de Equipo',
  offboarding: 'Offboarding',
};

const pendienteEstadoColors: Record<string, string> = {
  pendiente: 'text-yellow-600',
  gestionando: 'text-primary-700',
  entregado: 'text-green-600',
  no_aplica: 'text-fg-subtle',
};

const pendienteLabels: Record<string, string> = {
  celular: 'Celular',
  audifonos: 'Audífonos',
  mochila: 'Mochila',
  cargador: 'Cargador',
  epp_zapatos: 'EPP - Zapatos',
  epp_chaleco: 'EPP - Chaleco',
  epp_casco: 'EPP - Casco',
  epp_lentes: 'EPP - Lentes',
  kit_bienvenida: 'Kit de Bienvenida',
  otro: 'Otro',
};

// Ultimo paso de cada tipo: un ticket heredado en estos estados se puede cerrar.
const CIERRE_HEREDADO: Record<string, string> = {
  equipos_entregados: 'registro_rrhh',
  cambio_ejecutado: 'confirmacion_rrhh',
  equipo_recibido: 'consolidacion_cierre',
};

export default function SolicitudDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Cancelar solicitud: solo antes de ejecutar ningun efecto secundario
  // (ver handleCancelar / POST /api/solicitudes/[id]/cancelar).
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Kit de Bienvenida / EPP: catalogo con stock, independiente de Activos.
  const [kitCatalog, setKitCatalog] = useState<
    { id: string; nombre: string; categoria: 'kit_bienvenida' | 'epp'; cantidad: number }[]
  >([]);
  const [kitCantidades, setKitCantidades] = useState<Record<string, number>>({});
  const [entregandoKit, setEntregandoKit] = useState<'kit_bienvenida' | 'epp' | null>(null);

  const fetchData = useCallback(async (): Promise<WorkflowDetail | null> => {
    try {
      const res = await fetch(`/api/solicitudes/${id}`);
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, 'Error al cargar solicitud');
        setFieldErrors(fe);
        throw new Error(message);
      }
      const detail: WorkflowDetail = await res.json();
      setData(detail);
      return detail;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!data || data.tipo !== 'onboarding') return;
    if (!data.kitBienvenidaSolicitado && !data.eppSolicitado) return;
    // Scoped to the request's sede so kit stock from other sedes isn't offered.
    fetch(`/api/kit-items${data.sedeId ? `?sedeId=${data.sedeId}` : ''}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setKitCatalog)
      .catch(() => setKitCatalog([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, data?.tipo, data?.kitBienvenidaSolicitado, data?.eppSolicitado]);

  const handleEntregarKit = async (categoria: 'kit_bienvenida' | 'epp') => {
    if (!data) return;
    const items = kitCatalog
      .filter((it) => it.categoria === categoria)
      .map((it) => ({ itemId: it.id, cantidad: kitCantidades[it.id] || 0 }))
      .filter((it) => it.cantidad > 0);
    if (items.length === 0) return;
    setEntregandoKit(categoria);
    setError('');
    setFieldErrors({});
    try {
      const res = await fetch(`/api/solicitudes/${id}/kit-epp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, 'Error al entregar');
        setFieldErrors(fe);
        throw new Error(message);
      }
      setKitCantidades((prev) => {
        const next = { ...prev };
        items.forEach((it) => delete next[it.itemId]);
        return next;
      });
      const actualizado = await fetchData();
      if (actualizado) {
        fetch(`/api/kit-items${actualizado.sedeId ? `?sedeId=${actualizado.sedeId}` : ''}`)
          .then((res) => (res.ok ? res.json() : []))
          .then(setKitCatalog)
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setEntregandoKit(null);
    }
  };

  const [marcandoNoAplica, setMarcandoNoAplica] = useState<string | null>(null);

  // Marca un articulo requerido (RequestKitItem) como "No aplica" -- la
  // salida para cuando genuinamente no hay como entregarlo (sin stock, no
  // corresponde al puesto, etc.) y el ticket necesita poder cerrarse igual.
  const handleMarcarNoAplica = async (requestKitItemId: string) => {
    const motivo = window.prompt(
      '¿Por qué no aplica este artículo? (obligatorio, se guarda en el ticket)'
    );
    if (!motivo || !motivo.trim()) return;
    setMarcandoNoAplica(requestKitItemId);
    setError('');
    setFieldErrors({});
    try {
      const res = await fetch(`/api/solicitudes/${id}/kit-epp`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestKitItemId, motivo: motivo.trim() }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, 'Error al marcar como no aplica');
        setFieldErrors(fe);
        throw new Error(message);
      }
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setMarcandoNoAplica(null);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    setError('');
    setFieldErrors({});
    try {
      const res = await fetch(`/api/solicitudes/${id}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: commentText, esInterno: commentInternal }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, 'Error al agregar comentario');
        setFieldErrors(fe);
        throw new Error(message);
      }
      setCommentText('');
      setCommentInternal(false);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleTransition = async (nuevoEstado: string, datosAccion?: Record<string, unknown>) => {
    setTransitioning(true);
    setError('');
    setFieldErrors({});
    try {
      const res = await fetch(`/api/solicitudes/${id}/transicion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosAccion ? { nuevoEstado, datosAccion } : { nuevoEstado }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, 'Error al avanzar solicitud');
        setFieldErrors(fe);
        throw new Error(message);
      }
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setTransitioning(false);
    }
  };

  // Cancela la solicitud: solo tiene sentido mientras no ejecuto ningun
  // efecto secundario (assignmentIds/kitReturnIds vacios) -- la ruta lo
  // valida igual del lado del servidor, esto es solo para no ofrecer el
  // boton cuando ya no aplica. Pide motivo obligatorio.
  const handleCancelar = async () => {
    if (!motivoCancelacion.trim()) {
      setError('Indica el motivo de la cancelación');
      return;
    }
    setCancelling(true);
    setError('');
    setFieldErrors({});
    try {
      const res = await fetch(`/api/solicitudes/${id}/cancelar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoCancelacion.trim() }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, 'Error al cancelar la solicitud');
        setFieldErrors(fe);
        throw new Error(message);
      }
      setShowCancelModal(false);
      setMotivoCancelacion('');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setCancelling(false);
    }
  };

  const handleUpdatePendiente = async (pendienteId: string, estado: string) => {
    try {
      await fetch(`/api/solicitudes/${id}/pendientes/${pendienteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-fg-subtle">Solicitud no encontrada</p>
        <Link href="/solicitudes" className="text-primary-700 hover:underline mt-2 inline-block">
          Volver a solicitudes
        </Link>
      </div>
    );
  }

  const isClosed = !!data.fechaCierre;
  // Estado final alcanzable en un paso desde el estado actual, para tickets
  // heredados del flujo por etapas. En etapas anteriores faltan datos.
  const cierreHeredado = CIERRE_HEREDADO[data.estado] ?? null;

  // Kit de Bienvenida / EPP: cuanto se ha entregado ya para esta solicitud
  // (independiente del estado del ticket -- puede entregarse en cualquier
  // momento mientras la solicitud siga abierta).
  const kitEntregadoTotal = (categoria: 'kit_bienvenida' | 'epp') =>
    data.kitAssignments
      .filter((ka) => ka.item.categoria === categoria)
      .reduce((sum, ka) => sum + ka.cantidad, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/solicitudes" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="h-5 w-5 text-fg-muted" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-fg">{data.numero}</h1>
              {data.estado === 'cancelada' ? (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-200 text-fg-muted">
                  CANCELADA
                </span>
              ) : (
                isClosed && (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                    CERRADA
                  </span>
                )
              )}
            </div>
            <p className="text-fg-muted">{tipoLabels[data.tipo]}</p>
          </div>
        </div>

        {/* Cancelar: solo mientras la solicitud no ejecuto ningun efecto
            secundario todavia (ver handleCancelar). Para el caso "este
            ticket no debia existir" -- duplicado, error de carga, ya no
            aplica -- no para cerrar un proceso que si avanzo. */}
        {!isClosed && data.assignmentIds.length === 0 && data.kitReturnIds.length === 0 && (
          <button
            type="button"
            onClick={() => setShowCancelModal(true)}
            className="text-sm text-red-600 hover:underline"
          >
            Cancelar solicitud
          </button>
        )}
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-lg shadow-lg p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-fg">Cancelar solicitud</h3>
            <p className="text-sm text-fg-subtle">
              Esta solicitud todavía no ejecutó ninguna acción sobre el inventario, así que se
              puede cancelar directamente. Se registrará en el historial del ticket con el motivo
              que indiques.
            </p>
            <div>
              <label className="field-label">Motivo *</label>
              <textarea
                value={motivoCancelacion}
                onChange={(e) => setMotivoCancelacion(e.target.value)}
                placeholder="Ej: Ticket duplicado, ya no corresponde..."
                rows={3}
                className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCancelModal(false);
                  setMotivoCancelacion('');
                }}
                disabled={cancelling}
                className={buttonClasses({ variant: "outline" })}
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleCancelar}
                disabled={cancelling || !motivoCancelacion.trim()}
                className={buttonClasses({ variant: "danger" })}
              >
                {cancelling ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hoy toda solicitud nace cerrada (SPEC 2.82). Un ticket abierto es
              heredado del flujo por etapas; si esta a un paso del final se
              puede cerrar con la transicion existente. */}
          {!isClosed && data.estado !== 'cancelada' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="font-medium text-amber-900 mb-1">Solicitud en una etapa intermedia</h3>
              <p className="text-sm text-amber-800">
                Se creó con el flujo anterior por etapas y quedó sin cerrar. Hoy las solicitudes
                se crean y se cierran en el mismo formulario.
                {!cierreHeredado &&
                  ' Si no tiene equipos asignados puedes cancelarla y crearla de nuevo.'}
              </p>
              {cierreHeredado && (
                <button
                  onClick={() => handleTransition(cierreHeredado)}
                  disabled={transitioning}
                  className={cn(buttonClasses(), 'mt-3')}
                >
                  <ChevronRight className="h-4 w-4" />
                  {transitioning ? 'Cerrando...' : 'Cerrar ticket'}
                </button>
              )}
            </div>
          )}

          {/* Document download, available for all request types once the
              equipment has been delivered/returned/changed, and it stays
              available after the ticket is closed. */}
          {(() => {
            const doc =
              data.tipo === 'onboarding' &&
              (data.estado === 'equipos_entregados' || data.estado === 'registro_rrhh')
                ? { tipo: 'comprobante-entrega', label: 'Comprobante de Entrega' }
                : data.tipo === 'offboarding' &&
                    (data.estado === 'equipo_recibido' || data.estado === 'consolidacion_cierre') &&
                    // Sin equipos devueltos no hay acta (SPEC 2.87).
                    data.equiposDevueltos.some(
                      (a) =>
                        !!a.estadoDevolucion && a.estadoDevolucion !== 'no_devuelto' && !a.recuperadoEn
                    )
                  ? { tipo: 'acta-devolucion', label: 'Acta de Devolución' }
                  : data.tipo === 'cambio_equipo' &&
                      (data.estado === 'cambio_ejecutado' || data.estado === 'confirmacion_rrhh')
                    ? { tipo: 'comprobante-cambio', label: 'Comprobante de Cambio' }
                    : null;
            if (!doc) return null;
            return (
              <div className="card p-6">
                <h3 className="font-semibold text-fg mb-1">Documentos</h3>
                <p className="text-sm text-fg-subtle mb-3">
                  Descarga el comprobante con los datos ya rellenados.
                </p>
                <a
                  href={`/api/solicitudes/${data.id}/documento/${doc.tipo}`}
                  className={buttonClasses({ variant: "outline" })}
                >
                  <Download className="h-4 w-4" />
                  {doc.label}
                </a>
              </div>
            );
          })()}

          {/* Detalle articulo-por-articulo de lo requerido (RequestKitItem):
              solo aparece si el ticket se creo con esa lista. Cada articulo
              se resuelve solo (entregado) al entregarse desde el panel de
              abajo, o manualmente con "No aplica" si genuinamente no se
              puede entregar. */}
          {data.tipo === 'onboarding' &&
            data.kitRequeridos.length > 0 &&
            (['kit_bienvenida', 'epp'] as const).map((categoria) => {
              const requeridos = data.kitRequeridos.filter((r) => r.item.categoria === categoria);
              if (requeridos.length === 0) return null;
              const label = categoria === 'kit_bienvenida' ? 'Kit de Bienvenida' : 'EPP';
              return (
                <div key={categoria} className="card p-6">
                  <h3 className="font-semibold text-fg mb-1">Artículos Requeridos: {label}</h3>
                  <p className="text-sm text-fg-subtle mb-3">
                    {label} pedido específicamente para este ticket.
                  </p>
                  <div className="space-y-2">
                    {requeridos.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-0"
                      >
                        <div>
                          <span className="text-sm text-fg">
                            {r.item.nombre} × {r.cantidad}
                          </span>
                          <span className="block text-xs text-fg-subtle">
                            {r.estado === 'no_aplica' && r.motivoNoAplica ? r.motivoNoAplica : ''}
                          </span>
                        </div>
                        {r.estado === 'pendiente' && !isClosed ? (
                          <button
                            onClick={() => handleMarcarNoAplica(r.id)}
                            disabled={marcandoNoAplica === r.id}
                            className="text-xs px-2 py-1 border border-line-strong rounded-lg text-fg-muted hover:bg-surface-muted disabled:opacity-50 whitespace-nowrap"
                          >
                            {marcandoNoAplica === r.id ? 'Marcando...' : 'No aplica'}
                          </button>
                        ) : (
                          <span
                            className={cn(
                              'text-xs px-2 py-0.5 rounded-full whitespace-nowrap',
                              r.estado === 'entregado'
                                ? 'bg-green-100 text-green-800'
                                : r.estado === 'no_aplica'
                                  ? 'bg-gray-100 text-fg-muted'
                                  : 'bg-amber-100 text-amber-800'
                            )}
                          >
                            {r.estado === 'entregado'
                              ? 'Entregado'
                              : r.estado === 'no_aplica'
                                ? 'No aplica'
                                : 'Pendiente'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

          {/* Kit de Bienvenida / EPP: independiente del estado de la solicitud
              y de la entrega de equipos -- se puede entregar en cualquier
              momento mientras el ticket siga abierto. */}
          {data.tipo === 'onboarding' && !isClosed && (data.kitBienvenidaSolicitado || data.eppSolicitado) && (
            <div className="space-y-4">
              {(['kit_bienvenida', 'epp'] as const)
                .filter((categoria) =>
                  categoria === 'kit_bienvenida' ? data.kitBienvenidaSolicitado : data.eppSolicitado
                )
                .map((categoria) => {
                  const items = kitCatalog.filter((it) => it.categoria === categoria);
                  const entregado = kitEntregadoTotal(categoria);
                  const label = categoria === 'kit_bienvenida' ? 'Kit de Bienvenida' : 'EPP';

                  // Si ya se entrego algo de esta categoria para esta solicitud
                  // (por ejemplo, se reservo al crear el ticket), no hace falta
                  // seguir pidiendolo aca -- se muestra como ya resuelto, igual
                  // que "Todos los equipos fueron entregados" en Gestion TI.
                  if (entregado > 0) {
                    return (
                      <div key={categoria} className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium text-green-900">{label}</h3>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                            {entregado} entregado{entregado === 1 ? '' : 's'}
                          </span>
                        </div>
                        <p className="text-sm text-green-700 mt-1">Ya entregado, no queda pendiente.</p>
                      </div>
                    );
                  }

                  return (
                    <div key={categoria} className="card p-6">
                      <h3 className="font-semibold text-fg mb-1">{label}</h3>
                      <p className="text-sm text-fg-subtle mb-3">
                        Elige los artículos y cantidades a entregar a {data.employee.nombres}{' '}
                        {data.employee.apellidoPaterno}.
                      </p>
                      {items.length === 0 ? (
                        <p className="text-sm text-fg-subtle">
                          No hay artículos cargados en el catálogo de {label}. Puedes crearlos en
                          Configuración → Kit de Bienvenida y EPP.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {items.map((it) => (
                            <div key={it.id} className="flex items-center justify-between gap-3 py-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-fg">{it.nombre}</span>
                                <span
                                  className={cn(
                                    'text-xs px-2 py-0.5 rounded-full border',
                                    it.cantidad > 0
                                      ? 'bg-green-50 text-green-700 border-green-200'
                                      : 'bg-red-50 text-red-700 border-red-200'
                                  )}
                                >
                                  {it.cantidad} disponibles
                                </span>
                              </div>
                              <input
                                type="number"
                                min={0}
                                max={it.cantidad}
                                value={kitCantidades[it.id] || ''}
                                onChange={(e) =>
                                  setKitCantidades((prev) => ({
                                    ...prev,
                                    [it.id]: Math.max(0, Math.min(it.cantidad, Number(e.target.value) || 0)),
                                  }))
                                }
                                disabled={it.cantidad === 0}
                                placeholder="0"
                                className="w-20 text-sm border border-line-strong rounded px-2 py-1 disabled:bg-gray-100"
                              />
                            </div>
                          ))}
                          <button
                            onClick={() => handleEntregarKit(categoria)}
                            disabled={
                              entregandoKit === categoria ||
                              items.every((it) => !(kitCantidades[it.id] > 0))
                            }
                            className={buttonClasses({ className: "mt-2" })}
                          >
                            {entregandoKit === categoria ? 'Entregando...' : `Entregar ${label}`}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* Pendientes Checklist */}
          {data.pendientes.length > 0 && (
            <div className="card p-6">
              <h2 className="font-semibold text-fg mb-4">Pendientes / Checklist</h2>
              <div className="space-y-3">
                {data.pendientes.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className={cn('text-sm', pendienteEstadoColors[p.estado])}>
                        {p.estado === 'entregado' ? (
                          <CheckCircle className="h-5 w-5" />
                        ) : p.estado === 'no_aplica' ? (
                          <Circle className="h-5 w-5" />
                        ) : (
                          <Clock className="h-5 w-5" />
                        )}
                      </span>
                      <div>
                        <span className="text-sm font-medium text-fg">
                          {pendienteLabels[p.tipo] || p.tipo}
                        </span>
                        {p.descripcion && (
                          <span className="block text-xs text-fg-subtle">{p.descripcion}</span>
                        )}
                      </div>
                    </div>
                    {!isClosed && (
                      <select
                        value={p.estado}
                        onChange={(e) => handleUpdatePendiente(p.id, e.target.value)}
                        className="text-sm border border-line-strong rounded px-2 py-1"
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="gestionando">Gestionando</option>
                        <option value="entregado">Entregado</option>
                        <option value="no_aplica">No Aplica</option>
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Timeline */}
          <div className="card p-6">
            <h2 className="font-semibold text-fg mb-4">Actividad</h2>

            {/* Comment Form */}
            {!isClosed && (
              <div className="mb-6 pb-4 border-b">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Agregar comentario..."
                  rows={2}
                  className="w-full px-3 py-2 border border-line-strong rounded-lg text-sm"
                />
                <div className="flex justify-between items-center mt-2">
                  <label className="flex items-center gap-2 text-sm text-fg-muted">
                    <input
                      type="checkbox"
                      checked={commentInternal}
                      onChange={(e) => setCommentInternal(e.target.checked)}
                      className="rounded border-line-strong"
                    />
                    Nota interna
                  </label>
                  <button
                    onClick={handleAddComment}
                    disabled={submittingComment || !commentText.trim()}
                    className={buttonClasses({ size: "sm" })}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Enviar
                  </button>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="space-y-4">
              {/* Merge and sort comments + transitions */}
              {[
                ...data.comments.map((c) => ({
                  type: 'comment' as const,
                  date: c.createdAt,
                  data: c,
                })),
                ...data.transitions.map((t) => ({
                  type: 'transition' as const,
                  date: t.createdAt,
                  data: t,
                })),
              ]
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                        item.type === 'comment' ? 'bg-primary-100' : 'bg-green-100'
                      )}
                    >
                      {item.type === 'comment' ? (
                        <MessageSquare className="h-4 w-4 text-primary-700" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.type === 'comment' ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-fg">
                              {item.data.autor.nombre}
                            </span>
                            {item.data.esInterno && (
                              <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                                Interna
                              </span>
                            )}
                            <span className="text-xs text-fg-subtle">
                              {new Date(item.data.createdAt).toLocaleString('es-CL')}
                            </span>
                          </div>
                          <p className="text-sm text-fg-muted mt-1">{item.data.mensaje}</p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-fg">
                              {item.data.ejecutadoPor.nombre}
                            </span>
                            <span className="text-xs text-fg-subtle">
                              {new Date(item.data.createdAt).toLocaleString('es-CL')}
                            </span>
                          </div>
                          <p className="text-sm text-fg-muted mt-1">
                            {item.data.estadoAnterior === item.data.estadoNuevo
                              ? 'Solicitud creada'
                              : `${estadoLabels[item.data.estadoAnterior]} → ${estadoLabels[item.data.estadoNuevo]}`}
                          </p>
                          {item.data.comentario && (
                            <p className="text-sm text-fg-subtle mt-1 italic">
                              {item.data.comentario}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Request Info */}
          <div className="card p-6">
            <h3 className="font-semibold text-fg mb-4">Información</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-fg-subtle">Empleado</dt>
                <dd className="font-medium text-fg">
                  {data.employee.nombres} {data.employee.apellidoPaterno}
                </dd>
                <dd className="text-xs text-fg-subtle">
                  {data.employee.rut || '—'} · {data.employee.correoPersonal}
                </dd>
              </div>
              {data.employee.cargo && (
                <div>
                  <dt className="text-fg-subtle">Cargo</dt>
                  <dd className="text-fg">{data.employee.cargo}</dd>
                </div>
              )}
              <div>
                <dt className="text-fg-subtle">Solicitante</dt>
                <dd className="flex items-center gap-1 text-fg">
                  <User className="h-3.5 w-3.5 text-fg-subtle" />
                  {data.solicitante.nombre}
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Responsable Actual</dt>
                <dd className="text-fg">
                  {data.responsableActual?.nombre || 'Sin asignar'}
                </dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Fecha Creación</dt>
                <dd className="text-fg">
                  {new Date(data.createdAt).toLocaleDateString('es-CL')}
                </dd>
              </div>
              {data.fechaCierre && (
                <div>
                  <dt className="text-fg-subtle">Fecha Cierre</dt>
                  <dd className="text-fg">
                    {new Date(data.fechaCierre).toLocaleDateString('es-CL')}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Type-specific info */}
          <div className="card p-6">
            <h3 className="font-semibold text-fg mb-4">Detalle del Tipo</h3>
            <dl className="space-y-3 text-sm">
              {data.tipo === 'onboarding' && (
                <>
                  {data.fechaIngreso && (
                    <div>
                      <dt className="text-fg-subtle">Fecha Ingreso</dt>
                      <dd className="text-fg">
                        {formatearFecha(data.fechaIngreso)}
                      </dd>
                    </div>
                  )}
                  {data.cargoSolicitado && (
                    <div>
                      <dt className="text-fg-subtle">Cargo</dt>
                      <dd className="text-fg">{data.cargoSolicitado}</dd>
                    </div>
                  )}
                  {data.ubicacionDestino && (
                    <div>
                      <dt className="text-fg-subtle">Ubicación</dt>
                      <dd className="text-fg">{data.ubicacionDestino}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-fg-subtle">Equipos Solicitados</dt>
                    <dd className="text-fg">
                      {data.categoriasRequeridas.length > 0
                        ? data.categoriasRequeridas.join(', ')
                        : 'Ninguno'}
                    </dd>
                  </div>
                </>
              )}
              {data.tipo === 'cambio_equipo' && (
                <>
                  {data.motivoCambio && (
                    <div>
                      <dt className="text-fg-subtle">Motivo</dt>
                      <dd className="text-fg">{data.motivoCambio}</dd>
                    </div>
                  )}
                </>
              )}
              {data.tipo === 'offboarding' && (
                <>
                  {data.fechaDesvinculacion && (
                    <div>
                      <dt className="text-fg-subtle">Fecha Desvinculación</dt>
                      <dd className="text-fg">
                        {formatearFecha(data.fechaDesvinculacion)}
                      </dd>
                    </div>
                  )}
                  {data.medioDevolucion && (
                    <div>
                      <dt className="text-fg-subtle">Medio</dt>
                      <dd className="text-fg">
                        {data.medioDevolucion === 'presencial' ? 'Presencial' : 'Despacho (Chilexpress)'}
                      </dd>
                    </div>
                  )}
                  {data.otChilexpress && (
                    <div>
                      <dt className="text-fg-subtle">OT Chilexpress</dt>
                      <dd className="text-fg">{data.otChilexpress}</dd>
                    </div>
                  )}
                  {data.ciudadDevolucion && (
                    <div>
                      <dt className="text-fg-subtle">Ubicación</dt>
                      <dd className="text-fg">{data.ciudadDevolucion}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>

          {/* Equipos Entregados: lo que se entrego en ESTE onboarding. Queda a
              la vista aunque despues el empleado cambie de equipo o se
              desvincule (a diferencia de "Equipos actuales"). */}
          {data.tipo === 'onboarding' && data.equiposEntregados.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-fg mb-4">
                Equipos Entregados ({data.equiposEntregados.length})
              </h3>
              <div className="space-y-2">
                {data.equiposEntregados.map((a) => (
                  <FilaEquipoTicket key={a.id} asignacion={a} modo="entrega" />
                ))}
              </div>
            </div>
          )}

          {/* Lo que el empleado tiene hoy, no necesariamente de este ticket. */}
          {data.employee.assignments.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-fg mb-4">Equipos actuales del empleado</h3>
              <div className="space-y-2">
                {data.employee.assignments.map((a) => (
                  <div key={a.id} className="text-sm p-2 bg-surface-muted rounded">
                    <span className="font-medium">
                      {a.asset.marca} {a.asset.modelo}
                    </span>
                    <span className="block text-xs text-fg-subtle">
                      {a.asset.categoria.nombre}
                      {a.asset.numeroSerie && ` · S/N: ${a.asset.numeroSerie}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Equipos Devueltos: lo que ya se recibio y califico en este
              ticket de offboarding, con su estado y observaciones -- para
              que quede a la vista sin tener que ir al modulo de
              Asignaciones a buscar cada asignacion por separado. */}
          {data.tipo === 'offboarding' && data.equiposDevueltos.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-fg mb-4">Equipos Devueltos</h3>
              <div className="space-y-2">
                {data.equiposDevueltos.map((a) => (
                  <FilaEquipoTicket key={a.id} asignacion={a} modo="devolucion" />
                ))}
              </div>
            </div>
          )}

          {/* EPP Devuelto: mismo criterio que Equipos Devueltos, pero para
              el EPP (el Kit de Bienvenida no se devuelve). El estado y las
              observaciones quedan en KitAssignment.observaciones porque no
              hay un campo aparte como en Assignment. */}
          {data.tipo === 'offboarding' && data.eppDevueltos.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-fg mb-4">EPP Devuelto</h3>
              <div className="space-y-2">
                {data.eppDevueltos.map((k) => (
                  <div key={k.id} className="text-sm p-3 bg-surface-muted rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-fg">{k.item.nombre}</span>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded flex-shrink-0',
                          k.estado === 'perdido'
                            ? 'bg-red-100 text-red-700'
                            : k.estado === 'no_devuelto'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-700'
                        )}
                      >
                        {k.estado === 'perdido'
                          ? 'Dañado'
                          : k.estado === 'no_devuelto'
                            ? 'No devolvió'
                            : 'Buen estado'}
                      </span>
                    </div>
                    {k.observaciones && (
                      <p className="text-xs text-fg-muted mt-1">{k.observaciones}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Equipos Cambiados: un bloque por par, con el equipo devuelto (y la
              condicion en que volvio) y su reemplazo (SPEC 2.84). */}
          {data.tipo === 'cambio_equipo' && data.paresCambio.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-fg mb-4">
                {data.paresCambio.length > 1
                  ? `Equipos Cambiados (${data.paresCambio.length})`
                  : 'Equipo Cambiado'}
              </h3>
              <div className="space-y-4">
                {data.paresCambio.map(({ anterior, nuevo }, i) => (
                  <div key={anterior?.id ?? nuevo?.id ?? i} className="space-y-2">
                    {anterior && (
                      <FilaEquipoTicket asignacion={anterior} modo="devolucion" prefijo="Anterior" />
                    )}
                    {nuevo && (
                      <FilaEquipoTicket asignacion={nuevo} modo="entrega" prefijo="Nuevo" destacado />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entrega Coordinada: fecha/hora y medio (presencial/despacho)
              definidos en la etapa "Coordinando Entrega". Tarjeta aparte para
              que se vea de un vistazo, igual que Equipos Asignados. */}
          {data.tipo === 'onboarding' && data.fechaEntregaCoordinada && (
            <div className="card p-6">
              <h3 className="font-semibold text-fg mb-4">Entrega Coordinada</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-fg-subtle">
                    {data.medioEntrega === 'presencial' ? 'Fecha y Hora' : 'Fecha y Hora Estimada'}
                  </dt>
                  <dd className="text-fg">
                    {new Date(data.fechaEntregaCoordinada).toLocaleString('es-CL')}
                  </dd>
                </div>
                {data.medioEntrega && (
                  <div>
                    <dt className="text-fg-subtle">Medio</dt>
                    <dd className="text-fg">
                      {data.medioEntrega === 'presencial' ? 'Presencial' : 'Despacho (Chilexpress)'}
                    </dd>
                  </div>
                )}
                {data.lugarEntrega && (
                  <div>
                    <dt className="text-fg-subtle">Lugar</dt>
                    <dd className="text-fg">{data.lugarEntrega}</dd>
                  </div>
                )}
                {data.otChilexpressEntrega && (
                  <div>
                    <dt className="text-fg-subtle">OT Chilexpress</dt>
                    <dd className="text-fg">{data.otChilexpressEntrega}</dd>
                  </div>
                )}
                {data.ciudadEntrega && (
                  <div>
                    <dt className="text-fg-subtle">Ubicación de destino</dt>
                    <dd className="text-fg">{data.ciudadEntrega}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Cambio Coordinado: mismo patron que Entrega Coordinada, para
              cambio_equipo. */}
          {data.tipo === 'cambio_equipo' && data.fechaCambioCoordinada && (
            <div className="card p-6">
              <h3 className="font-semibold text-fg mb-4">Cambio Coordinado</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-fg-subtle">
                    {data.medioCambio === 'presencial' ? 'Fecha y Hora' : 'Fecha Estimada de Llegada'}
                  </dt>
                  <dd className="text-fg">
                    {new Date(data.fechaCambioCoordinada).toLocaleString('es-CL')}
                  </dd>
                </div>
                {data.medioCambio && (
                  <div>
                    <dt className="text-fg-subtle">Medio</dt>
                    <dd className="text-fg">
                      {data.medioCambio === 'presencial' ? 'Presencial' : 'Despacho (Chilexpress)'}
                    </dd>
                  </div>
                )}
                {data.lugarCambio && (
                  <div>
                    <dt className="text-fg-subtle">Lugar</dt>
                    <dd className="text-fg">{data.lugarCambio}</dd>
                  </div>
                )}
                {data.otCambioChilexpress && (
                  <div>
                    <dt className="text-fg-subtle">OT Chilexpress</dt>
                    <dd className="text-fg">{data.otCambioChilexpress}</dd>
                  </div>
                )}
                {data.ciudadCambio && (
                  <div>
                    <dt className="text-fg-subtle">Ciudad destino</dt>
                    <dd className="text-fg">{data.ciudadCambio}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Devolución Coordinada: mismo patron, para offboarding. */}
          {data.tipo === 'offboarding' && data.fechaDevolucionCoordinada && (
            <div className="card p-6">
              <h3 className="font-semibold text-fg mb-4">Devolución Coordinada</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-fg-subtle">
                    {data.medioDevolucion === 'presencial' ? 'Fecha y Hora' : 'Fecha Estimada de Llegada'}
                  </dt>
                  <dd className="text-fg">
                    {new Date(data.fechaDevolucionCoordinada).toLocaleString('es-CL')}
                  </dd>
                </div>
                {data.medioDevolucion && (
                  <div>
                    <dt className="text-fg-subtle">Medio</dt>
                    <dd className="text-fg">
                      {data.medioDevolucion === 'presencial' ? 'Presencial' : 'Despacho (Chilexpress)'}
                    </dd>
                  </div>
                )}
                {data.lugarDevolucion && (
                  <div>
                    <dt className="text-fg-subtle">Lugar</dt>
                    <dd className="text-fg">{data.lugarDevolucion}</dd>
                  </div>
                )}
                {data.otChilexpress && (
                  <div>
                    <dt className="text-fg-subtle">OT Chilexpress</dt>
                    <dd className="text-fg">{data.otChilexpress}</dd>
                  </div>
                )}
                {data.ciudadDevolucion && (
                  <div>
                    <dt className="text-fg-subtle">Ciudad destino</dt>
                    <dd className="text-fg">{data.ciudadDevolucion}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Kit de Bienvenida y EPP entregados con esta solicitud -- son
              insumos, no Activos, por eso van en su propia tarjeta separada
              de "Equipos Asignados". Se muestran en tarjetas separadas (no
              mezcladas en una lista) porque son cosas distintas: el Kit es
              consumible y no se devuelve, el EPP si se pide de vuelta al
              desvincularse. */}
          {(['kit_bienvenida', 'epp'] as const).map((categoria) => {
            const entregas = data.kitAssignments.filter((ka) => ka.item.categoria === categoria);
            if (entregas.length === 0) return null;
            const label = categoria === 'kit_bienvenida' ? 'Kit de Bienvenida' : 'EPP';
            return (
              <div key={categoria} className="card p-6">
                <h3 className="font-semibold text-fg mb-4">{label}</h3>
                <div className="space-y-2">
                  {entregas.map((ka) => (
                    <div key={ka.id} className="text-sm p-2 bg-surface-muted rounded">
                      <span className="font-medium">
                        {ka.item.nombre} × {ka.cantidad}
                      </span>
                      <span className="block text-xs text-fg-subtle">
                        {new Date(ka.createdAt).toLocaleDateString('es-CL')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {data.observaciones && (
            <div className="card p-6">
              <h3 className="font-semibold text-fg mb-2">Observaciones</h3>
              <p className="text-sm text-fg-muted">{data.observaciones}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
