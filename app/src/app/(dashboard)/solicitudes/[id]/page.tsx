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
  AlertCircle,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SeleccionarEquiposOnboarding } from '@/components/solicitudes/SeleccionarEquiposOnboarding';

type WorkflowDetail = {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
  prioridad: string;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
  fechaCierre: string | null;
  // Onboarding
  fechaIngreso: string | null;
  cargoSolicitado: string | null;
  ubicacionDestino: string | null;
  categoriasRequeridas: string[];
  // Cambio
  ticketFreshdesk: string | null;
  motivoCambio: string | null;
  // Devolucion
  fechaDesvinculacion: string | null;
  medioDevolucion: string | null;
  otChilexpress: string | null;
  ciudadDevolucion: string | null;
  // References
  assignmentIds: string[];
  terminationId: string | null;
  dispatchGuideId: string | null;
  employee: {
    id: string;
    rut: string | null;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    cargo: string | null;
    correo: string;
    assignments: { id: string; activo: boolean; asset: { id: string; marca: string; modelo: string; numeroSerie: string | null; categoria: { nombre: string } } }[];
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
};

const estadoLabels: Record<string, string> = {
  solicitud_recibida: 'Solicitud Recibida',
  gestion_ti: 'Gestión TI',
  equipos_entregados: 'Equipos Entregados',
  registro_rrhh: 'Registro RRHH',
  incidencia_detectada: 'Incidencia Detectada',
  cambio_ejecutado: 'Cambio Ejecutado',
  confirmacion_rrhh: 'Confirmación RRHH',
  solicitud_emitida: 'Solicitud Emitida',
  coordinacion_en_curso: 'Coordinación en Curso',
  equipo_recibido: 'Equipo Recibido',
  consolidacion_cierre: 'Consolidación y Cierre',
};

const tipoLabels: Record<string, string> = {
  onboarding: 'Onboarding',
  cambio_equipo: 'Cambio de Equipo',
  devolucion_termino: 'Devolución por Término',
};

const prioridadColors: Record<string, string> = {
  baja: 'bg-gray-100 text-gray-700',
  media: 'bg-yellow-100 text-yellow-800',
  alta: 'bg-orange-100 text-orange-800',
  urgente: 'bg-red-100 text-red-800',
};

const pendienteEstadoColors: Record<string, string> = {
  pendiente: 'text-yellow-600',
  gestionando: 'text-blue-600',
  entregado: 'text-green-600',
  no_aplica: 'text-gray-400',
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

function getStatesForType(tipo: string): string[] {
  const map: Record<string, string[]> = {
    onboarding: ['solicitud_recibida', 'gestion_ti', 'equipos_entregados', 'registro_rrhh'],
    cambio_equipo: ['incidencia_detectada', 'cambio_ejecutado', 'confirmacion_rrhh'],
    devolucion_termino: ['solicitud_emitida', 'coordinacion_en_curso', 'equipo_recibido', 'consolidacion_cierre'],
  };
  return map[tipo] || [];
}

// Onboarding se muestra al usuario como 3 etapas (crear solicitud, gestion TI,
// ticket cerrado) en vez de las 4 etapas reales de la maquina de estados:
// "equipos_entregados" y "registro_rrhh" comparten la etapa visual "Ticket Cerrado"
// porque para el tecnico el trabajo ya esta hecho una vez entregado el equipo,
// aunque falte la confirmacion de RRHH para cerrar formalmente.
const onboardingStages: { key: string; label: string; states: string[] }[] = [
  { key: 'creada', label: 'Solicitud Creada', states: ['solicitud_recibida'] },
  { key: 'gestion_ti', label: 'Gestión TI', states: ['gestion_ti'] },
  { key: 'ticket_cerrado', label: 'Ticket Cerrado', states: ['equipos_entregados', 'registro_rrhh'] },
];

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

  const fetchData = useCallback(async (): Promise<WorkflowDetail | null> => {
    try {
      const res = await fetch(`/api/solicitudes/${id}`);
      if (!res.ok) throw new Error('Error al cargar solicitud');
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

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/solicitudes/${id}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensaje: commentText, esInterno: commentInternal }),
      });
      if (!res.ok) throw new Error('Error al agregar comentario');
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
    try {
      const res = await fetch(`/api/solicitudes/${id}/transicion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosAccion ? { nuevoEstado, datosAccion } : { nuevoEstado }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al avanzar solicitud');
      }
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setTransitioning(false);
    }
  };

  // Etapa "Gestion TI" del onboarding: si la solicitud recien fue recibida,
  // primero avanza a gestion_ti. La entrega de equipos puede ser parcial --
  // se registran los que si hay disponibles y la solicitud se queda en
  // Gestion TI para completar el resto despues, en vez de bloquear todo el
  // paso por un solo producto sin stock. Cuando ya se cubrieron todas las
  // categorias requeridas, se cierra la etapa automaticamente.
  const handleEntregarEquipos = async (assetIds: string[]) => {
    if (!data) return;
    setTransitioning(true);
    setError('');
    try {
      if (data.estado === 'solicitud_recibida') {
        const resGestion = await fetch(`/api/solicitudes/${id}/transicion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nuevoEstado: 'gestion_ti' }),
        });
        if (!resGestion.ok) {
          const err = await resGestion.json();
          throw new Error(err.error || 'Error al avanzar a Gestión TI');
        }
      }

      if (assetIds.length > 0) {
        const resEntrega = await fetch(`/api/solicitudes/${id}/transicion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nuevoEstado: 'gestion_ti', datosAccion: { assetIds } }),
        });
        if (!resEntrega.ok) {
          const err = await resEntrega.json();
          throw new Error(err.error || 'Error al entregar equipos');
        }
      }

      const actualizado = await fetchData();
      if (!actualizado) return;

      const categoriasEntregadas = actualizado.employee.assignments
        .filter((a) => actualizado.assignmentIds.includes(a.id))
        .map((a) => a.asset.categoria.nombre);
      const faltan = actualizado.categoriasRequeridas.some(
        (c) => !categoriasEntregadas.includes(c)
      );

      if (!faltan && actualizado.estado === 'gestion_ti') {
        const resCierre = await fetch(`/api/solicitudes/${id}/transicion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nuevoEstado: 'equipos_entregados' }),
        });
        if (!resCierre.ok) {
          const err = await resCierre.json();
          throw new Error(err.error || 'Error al cerrar Gestión TI');
        }
        await fetchData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setTransitioning(false);
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Solicitud no encontrada</p>
        <Link href="/solicitudes" className="text-blue-600 hover:underline mt-2 inline-block">
          Volver a solicitudes
        </Link>
      </div>
    );
  }

  const states = getStatesForType(data.tipo);
  const currentStateIndex = states.indexOf(data.estado);
  const nextState = currentStateIndex < states.length - 1 ? states[currentStateIndex + 1] : null;
  const isClosed = !!data.fechaCierre;

  // Para onboarding el stepper visual usa 3 etapas (ver onboardingStages);
  // el resto de los tipos de solicitud sigue mostrando un nodo por estado real.
  const onboardingStageIndex = onboardingStages.findIndex((s) => s.states.includes(data.estado));
  const stepperItems = data.tipo === 'onboarding'
    ? onboardingStages.map((s) => ({ key: s.key, label: s.label }))
    : states.map((s) => ({ key: s, label: estadoLabels[s] }));
  const stepperCurrentIndex = data.tipo === 'onboarding' ? onboardingStageIndex : currentStateIndex;

  // Categorias ya cubiertas por asignaciones que pertenecen a esta solicitud
  // (assignmentIds), vs. las que todavia faltan por entregar. Permite mostrar
  // solo el selector de lo pendiente y avisar que hubo una entrega parcial.
  const categoriasEntregadas = data.tipo === 'onboarding'
    ? data.employee.assignments
        .filter((a) => data.assignmentIds.includes(a.id))
        .map((a) => a.asset.categoria.nombre)
    : [];
  const categoriasPendientes = data.tipo === 'onboarding'
    ? data.categoriasRequeridas.filter((c) => !categoriasEntregadas.includes(c))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/solicitudes" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{data.numero}</h1>
              <span className={cn('px-2 py-1 text-xs font-medium rounded-full', prioridadColors[data.prioridad])}>
                {data.prioridad.toUpperCase()}
              </span>
              {isClosed && (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                  CERRADA
                </span>
              )}
            </div>
            <p className="text-gray-600">{tipoLabels[data.tipo]}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* State Stepper */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-medium text-gray-500 mb-4">Progreso</h2>
        <div className="flex items-center">
          {stepperItems.map((item, i) => {
            const isCompleted = i < stepperCurrentIndex;
            const isCurrent = i === stepperCurrentIndex;
            return (
              <div key={item.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center',
                      isCompleted
                        ? 'bg-green-600 text-white'
                        : isCurrent
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : isCurrent ? (
                      <AlertCircle className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs mt-1 text-center',
                      isCurrent ? 'font-semibold text-blue-700' : 'text-gray-500'
                    )}
                  >
                    {item.label}
                  </span>
                </div>
                {i < stepperItems.length - 1 && (
                  <div
                    className={cn('h-0.5 w-full mx-1', i < stepperCurrentIndex ? 'bg-green-600' : 'bg-gray-200')}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Action Panel */}
          {data.tipo === 'onboarding' && !isClosed &&
          (data.estado === 'solicitud_recibida' ||
            (data.estado === 'gestion_ti' && categoriasPendientes.length > 0)) ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Gestión TI</h3>
              <p className="text-sm text-gray-500 mb-1">
                Selecciona los equipos disponibles para entregar a {data.employee.nombres} {data.employee.apellidoPaterno}.
              </p>
              {categoriasEntregadas.length > 0 && (
                <p className="text-xs text-green-700 mb-3">
                  Ya entregado: {categoriasEntregadas.join(', ')}
                </p>
              )}
              <SeleccionarEquiposOnboarding
                categoriasRequeridas={categoriasPendientes}
                submitting={transitioning}
                onSubmit={handleEntregarEquipos}
              />
            </div>
          ) : data.tipo === 'onboarding' && !isClosed && data.estado === 'gestion_ti' && categoriasPendientes.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-green-900 mb-2">Todos los equipos fueron entregados</h3>
              <p className="text-sm text-green-700 mb-3">
                Ya se cubrieron todas las categorías requeridas. Cierra la etapa de Gestión TI para continuar.
              </p>
              <button
                onClick={() => handleTransition('equipos_entregados')}
                disabled={transitioning}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
                {transitioning ? 'Cerrando...' : 'Cerrar Gestión TI'}
              </button>
            </div>
          ) : data.tipo === 'onboarding' && !isClosed && data.estado === 'equipos_entregados' ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-green-900 mb-2">Equipos entregados</h3>
              <p className="text-sm text-green-700 mb-3">
                Falta el registro de RRHH para cerrar el ticket.
              </p>
              <button
                onClick={() => handleTransition('registro_rrhh')}
                disabled={transitioning}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
                {transitioning ? 'Cerrando...' : 'Cerrar ticket'}
              </button>
            </div>
          ) : (
            nextState &&
            !isClosed && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">Siguiente paso</h3>
                <p className="text-sm text-blue-700 mb-3">
                  Avanzar a: <strong>{estadoLabels[nextState]}</strong>
                </p>
                <button
                  onClick={() => handleTransition(nextState)}
                  disabled={transitioning}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                  {transitioning ? 'Avanzando...' : `Avanzar a ${estadoLabels[nextState]}`}
                </button>
              </div>
            )
          )}

          {/* Pendientes Checklist */}
          {data.pendientes.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Pendientes / Checklist</h2>
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
                        <span className="text-sm font-medium text-gray-900">
                          {pendienteLabels[p.tipo] || p.tipo}
                        </span>
                        {p.descripcion && (
                          <span className="block text-xs text-gray-500">{p.descripcion}</span>
                        )}
                      </div>
                    </div>
                    {!isClosed && (
                      <select
                        value={p.estado}
                        onChange={(e) => handleUpdatePendiente(p.id, e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
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
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Actividad</h2>

            {/* Comment Form */}
            {!isClosed && (
              <div className="mb-6 pb-4 border-b">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Agregar comentario..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <div className="flex justify-between items-center mt-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={commentInternal}
                      onChange={(e) => setCommentInternal(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Nota interna
                  </label>
                  <button
                    onClick={handleAddComment}
                    disabled={submittingComment || !commentText.trim()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
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
                        item.type === 'comment' ? 'bg-blue-100' : 'bg-green-100'
                      )}
                    >
                      {item.type === 'comment' ? (
                        <MessageSquare className="h-4 w-4 text-blue-600" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.type === 'comment' ? (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {item.data.autor.nombre}
                            </span>
                            {item.data.esInterno && (
                              <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                                Interna
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {new Date(item.data.createdAt).toLocaleString('es-CL')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mt-1">{item.data.mensaje}</p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {item.data.ejecutadoPor.nombre}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(item.data.createdAt).toLocaleString('es-CL')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {item.data.estadoAnterior === item.data.estadoNuevo
                              ? 'Solicitud creada'
                              : `${estadoLabels[item.data.estadoAnterior]} → ${estadoLabels[item.data.estadoNuevo]}`}
                          </p>
                          {item.data.comentario && (
                            <p className="text-sm text-gray-500 mt-1 italic">
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
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Información</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Empleado</dt>
                <dd className="font-medium text-gray-900">
                  {data.employee.nombres} {data.employee.apellidoPaterno}
                </dd>
                <dd className="text-xs text-gray-500">
                  {data.employee.rut || '—'} · {data.employee.correo}
                </dd>
              </div>
              {data.employee.cargo && (
                <div>
                  <dt className="text-gray-500">Cargo</dt>
                  <dd className="text-gray-900">{data.employee.cargo}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Solicitante</dt>
                <dd className="flex items-center gap-1 text-gray-900">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  {data.solicitante.nombre}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Responsable Actual</dt>
                <dd className="text-gray-900">
                  {data.responsableActual?.nombre || 'Sin asignar'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Fecha Creación</dt>
                <dd className="text-gray-900">
                  {new Date(data.createdAt).toLocaleDateString('es-CL')}
                </dd>
              </div>
              {data.fechaCierre && (
                <div>
                  <dt className="text-gray-500">Fecha Cierre</dt>
                  <dd className="text-gray-900">
                    {new Date(data.fechaCierre).toLocaleDateString('es-CL')}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Type-specific info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Detalle del Tipo</h3>
            <dl className="space-y-3 text-sm">
              {data.tipo === 'onboarding' && (
                <>
                  {data.fechaIngreso && (
                    <div>
                      <dt className="text-gray-500">Fecha Ingreso</dt>
                      <dd className="text-gray-900">
                        {new Date(data.fechaIngreso).toLocaleDateString('es-CL')}
                      </dd>
                    </div>
                  )}
                  {data.cargoSolicitado && (
                    <div>
                      <dt className="text-gray-500">Cargo</dt>
                      <dd className="text-gray-900">{data.cargoSolicitado}</dd>
                    </div>
                  )}
                  {data.ubicacionDestino && (
                    <div>
                      <dt className="text-gray-500">Ubicación</dt>
                      <dd className="text-gray-900">{data.ubicacionDestino}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-gray-500">Equipos Solicitados</dt>
                    <dd className="text-gray-900">
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
                      <dt className="text-gray-500">Motivo</dt>
                      <dd className="text-gray-900">{data.motivoCambio}</dd>
                    </div>
                  )}
                  {data.ticketFreshdesk && (
                    <div>
                      <dt className="text-gray-500">Ticket Freshdesk</dt>
                      <dd className="text-gray-900">{data.ticketFreshdesk}</dd>
                    </div>
                  )}
                </>
              )}
              {data.tipo === 'devolucion_termino' && (
                <>
                  {data.fechaDesvinculacion && (
                    <div>
                      <dt className="text-gray-500">Fecha Desvinculación</dt>
                      <dd className="text-gray-900">
                        {new Date(data.fechaDesvinculacion).toLocaleDateString('es-CL')}
                      </dd>
                    </div>
                  )}
                  {data.medioDevolucion && (
                    <div>
                      <dt className="text-gray-500">Medio</dt>
                      <dd className="text-gray-900">{data.medioDevolucion}</dd>
                    </div>
                  )}
                  {data.otChilexpress && (
                    <div>
                      <dt className="text-gray-500">OT Chilexpress</dt>
                      <dd className="text-gray-900">{data.otChilexpress}</dd>
                    </div>
                  )}
                  {data.ciudadDevolucion && (
                    <div>
                      <dt className="text-gray-500">Ciudad</dt>
                      <dd className="text-gray-900">{data.ciudadDevolucion}</dd>
                    </div>
                  )}
                </>
              )}
            </dl>
          </div>

          {/* Active Assets */}
          {data.employee.assignments.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Equipos Asignados</h3>
              <div className="space-y-2">
                {data.employee.assignments.map((a) => (
                  <div key={a.id} className="text-sm p-2 bg-gray-50 rounded">
                    <span className="font-medium">
                      {a.asset.marca} {a.asset.modelo}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {a.asset.categoria.nombre}
                      {a.asset.numeroSerie && ` · S/N: ${a.asset.numeroSerie}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.observaciones && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Observaciones</h3>
              <p className="text-sm text-gray-700">{data.observaciones}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
