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
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SeleccionarEquiposOnboarding } from '@/components/solicitudes/SeleccionarEquiposOnboarding';
import { SeleccionarCambioEquipo } from '@/components/solicitudes/SeleccionarCambioEquipo';
import { parseApiError, type FieldErrors } from '@/lib/utils/apiErrors';
import { ApiErrorSummary } from '@/components/ui/ApiErrorSummary';

type WorkflowDetail = {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
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
  terminationId: string | null;
  dispatchGuideId: string | null;
  employee: {
    id: string;
    rut: string | null;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    cargo: string | null;
    correoPersonal: string;
    assignments: { id: string; activo: boolean; estadoDevolucion: string | null; asset: { id: string; marca: string; modelo: string; numeroSerie: string | null; categoria: { nombre: string } } }[];
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
  // Offboarding: equipos ya devueltos y calificados en este ticket (ver
  // assignmentIds -- quedan con activo:false asi que no vienen en
  // employee.assignments).
  equiposDevueltos: {
    id: string;
    fechaDevolucion: string | null;
    recibidoPor: string | null;
    estadoDevolucion: string | null;
    observacionesDevolucion: string | null;
    asset: { id: string; marca: string; modelo: string; numeroSerie: string | null; categoria: { nombre: string } };
  }[];
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
  // Cambio de equipo: equipo anterior (devuelto, con su condicion) y equipo
  // nuevo (entregado) de este ticket, ya separados por el backend.
  equipoCambioAnterior: {
    id: string;
    fechaDevolucion: string | null;
    recibidoPor: string | null;
    estadoDevolucion: string | null;
    observacionesDevolucion: string | null;
    asset: { id: string; marca: string; modelo: string; numeroSerie: string | null; categoria: { nombre: string } };
  } | null;
  equipoCambioNuevo: {
    id: string;
    fechaEntrega: string;
    entregadoPor: string | null;
    asset: { id: string; marca: string; modelo: string; numeroSerie: string | null; categoria: { nombre: string } };
  } | null;
};

const estadoLabels: Record<string, string> = {
  solicitud_recibida: 'Solicitud Recibida',
  gestion_ti: 'Gestión TI',
  coordinando_entrega: 'Coordinando Entrega',
  equipos_entregados: 'Equipos Entregados',
  registro_rrhh: 'Ticket Cerrado',
  incidencia_detectada: 'Incidencia Detectada',
  coordinando_cambio: 'Coordinando Cambio',
  cambio_ejecutado: 'Cambio Ejecutado',
  confirmacion_rrhh: 'Ticket Cerrado',
  solicitud_emitida: 'Solicitud Emitida',
  coordinacion_en_curso: 'Coordinando Devolución',
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
    onboarding: ['solicitud_recibida', 'gestion_ti', 'coordinando_entrega', 'equipos_entregados', 'registro_rrhh'],
    cambio_equipo: ['incidencia_detectada', 'coordinando_cambio', 'cambio_ejecutado', 'confirmacion_rrhh'],
    offboarding: ['solicitud_emitida', 'coordinacion_en_curso', 'equipo_recibido', 'consolidacion_cierre'],
  };
  return map[tipo] || [];
}

// Onboarding se muestra al usuario como 3 etapas (crear solicitud, gestion TI,
// ticket cerrado) en vez de las 4 etapas reales de la maquina de estados:
// "equipos_entregados" y "registro_rrhh" comparten la etapa visual "Ticket Cerrado"
// porque para el tecnico el trabajo ya esta hecho una vez entregado el equipo.
const onboardingStages: { key: string; label: string; states: string[] }[] = [
  { key: 'creada', label: 'Solicitud Creada', states: ['solicitud_recibida'] },
  { key: 'gestion_ti', label: 'Gestión TI', states: ['gestion_ti'] },
  { key: 'coordinando_entrega', label: 'Coordinar Entrega', states: ['coordinando_entrega'] },
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

  // Coordinar Entrega (onboarding): fecha/hora de entrega y, segun el medio,
  // el lugar (presencial) o la OT de despacho (Chilexpress).
  const [fechaEntregaCoordinada, setFechaEntregaCoordinada] = useState('');
  const [medioEntrega, setMedioEntrega] = useState<'presencial' | 'chilexpress'>('presencial');
  const [lugarEntrega, setLugarEntrega] = useState('');
  const [otChilexpressEntrega, setOtChilexpressEntrega] = useState('');
  const [ciudadEntrega, setCiudadEntrega] = useState('');

  // Coordinar Cambio (cambio_equipo): igual patron que Coordinar Entrega,
  // pero ANTES de ejecutar el cambio (no despues).
  const [fechaCambioCoordinada, setFechaCambioCoordinada] = useState('');
  const [medioCambio, setMedioCambio] = useState<'presencial' | 'chilexpress'>('presencial');
  const [lugarCambio, setLugarCambio] = useState('');
  const [otCambioChilexpress, setOtCambioChilexpress] = useState('');
  const [ciudadCambio, setCiudadCambio] = useState('');

  // Coordinar Devolución (offboarding): igual patron, ANTES de recibir los
  // equipos.
  const [fechaDevolucionCoordinada, setFechaDevolucionCoordinada] = useState('');
  const [medioDevolucion, setMedioDevolucion] = useState<'presencial' | 'chilexpress'>('presencial');
  const [lugarDevolucion, setLugarDevolucion] = useState('');
  const [otChilexpressDevolucion, setOtChilexpressDevolucion] = useState('');
  const [ciudadDevolucion, setCiudadDevolucion] = useState('');

  // Recepcion de equipos (offboarding): estado y observaciones por cada
  // asignacion activa del empleado, calificados de forma individual.
  const [devolucionEstados, setDevolucionEstados] = useState<Record<string, 'ok' | 'danado' | 'no_devuelto'>>({});
  const [devolucionObservaciones, setDevolucionObservaciones] = useState<Record<string, string>>({});
  // Mismo caso pero para EPP entregado y pendiente de devolver.
  const [devolucionEppEstados, setDevolucionEppEstados] = useState<Record<string, 'ok' | 'danado' | 'no_devuelto'>>({});
  const [devolucionEppObservaciones, setDevolucionEppObservaciones] = useState<Record<string, string>>({});

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
    fetch('/api/kit-items')
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
        fetch('/api/kit-items')
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

  // Etapa "Coordinando Entrega" del onboarding: confirma fecha/hora y medio
  // (presencial con lugar, o despacho Chilexpress con OT) y avanza a
  // equipos_entregados.
  const handleCoordinarEntrega = () => {
    if (!fechaEntregaCoordinada) {
      setError(
        medioEntrega === 'presencial'
          ? 'Indica la fecha y hora de entrega'
          : 'Indica la fecha y hora de entrega estimada'
      );
      return;
    }
    if (medioEntrega === 'presencial' && !lugarEntrega.trim()) {
      setError('Indica el lugar de la entrega presencial');
      return;
    }
    if (medioEntrega === 'chilexpress' && !otChilexpressEntrega.trim()) {
      setError('Indica el número de OT de Chilexpress');
      return;
    }
    if (medioEntrega === 'chilexpress' && !ciudadEntrega.trim()) {
      setError('Indica la ubicación de destino');
      return;
    }
    handleTransition('equipos_entregados', {
      fechaEntregaCoordinada,
      medioEntrega,
      lugarEntrega: medioEntrega === 'presencial' ? lugarEntrega : undefined,
      otChilexpressEntrega: medioEntrega === 'chilexpress' ? otChilexpressEntrega : undefined,
      ciudadEntrega: medioEntrega === 'chilexpress' ? ciudadEntrega : undefined,
    });
  };

  // Etapa "Incidencia Detectada" del cambio de equipo: antes de ejecutar el
  // cambio, se coordina cuando y como se va a hacer -- presencial (fecha,
  // hora y lugar) u OT de despacho (numero de OT, ciudad destino y fecha
  // estimada de llegada).
  const handleCoordinarCambio = () => {
    if (!fechaCambioCoordinada) {
      setError(
        medioCambio === 'presencial'
          ? 'Indica la fecha y hora del cambio'
          : 'Indica la fecha estimada de llegada'
      );
      return;
    }
    if (medioCambio === 'presencial' && !lugarCambio.trim()) {
      setError('Indica el lugar del cambio presencial');
      return;
    }
    if (medioCambio === 'chilexpress' && !otCambioChilexpress.trim()) {
      setError('Indica el número de OT de Chilexpress');
      return;
    }
    if (medioCambio === 'chilexpress' && !ciudadCambio.trim()) {
      setError('Indica la ciudad de destino');
      return;
    }
    handleTransition('coordinando_cambio', {
      fechaCambioCoordinada,
      medioCambio,
      lugarCambio: medioCambio === 'presencial' ? lugarCambio : undefined,
      otCambioChilexpress: medioCambio === 'chilexpress' ? otCambioChilexpress : undefined,
      ciudadCambio: medioCambio === 'chilexpress' ? ciudadCambio : undefined,
    });
  };

  // Etapa "Solicitud Emitida" del offboarding: antes de recibir los equipos,
  // se coordina cuando y como se van a devolver -- mismo patron que Coordinar
  // Cambio.
  const handleCoordinarDevolucion = () => {
    if (!fechaDevolucionCoordinada) {
      setError(
        medioDevolucion === 'presencial'
          ? 'Indica la fecha y hora de la devolución'
          : 'Indica la fecha estimada de llegada'
      );
      return;
    }
    if (medioDevolucion === 'presencial' && !lugarDevolucion.trim()) {
      setError('Indica el lugar de la devolución presencial');
      return;
    }
    if (medioDevolucion === 'chilexpress' && !otChilexpressDevolucion.trim()) {
      setError('Indica el número de OT de Chilexpress');
      return;
    }
    if (medioDevolucion === 'chilexpress' && !ciudadDevolucion.trim()) {
      setError('Indica la ciudad de destino');
      return;
    }
    handleTransition('coordinacion_en_curso', {
      fechaDevolucionCoordinada,
      medioDevolucion,
      lugarDevolucion: medioDevolucion === 'presencial' ? lugarDevolucion : undefined,
      otChilexpress: medioDevolucion === 'chilexpress' ? otChilexpressDevolucion : undefined,
      ciudadDevolucion: medioDevolucion === 'chilexpress' ? ciudadDevolucion : undefined,
    });
  };

  // Recepcion de equipos (offboarding): califica cada asignacion activa del
  // empleado (ok / danado) con observaciones opcionales, y avanza a
  // equipo_recibido. executeReturn se encarga de dejar cada Activo en "baja"
  // si esta danado o "reutilizable" si esta ok.
  // EPP realmente pendiente de devolver: entregado y de categoria EPP -- el
  // Kit de Bienvenida es consumible (nunca se pide de vuelta) y lo ya
  // devuelto no deberia volver a aparecer en esta lista.
  const eppPendienteDevolver = data
    ? data.employee.kitAssignments.filter(
        (k) => k.estado === 'entregado' && k.item.categoria === 'epp'
      )
    : [];

  // No hay un default silencioso: cada equipo/EPP necesita una seleccion
  // explicita (validado tambien en el boton de abajo, que queda deshabilitado
  // hasta que todos esten calificados) para que nunca se cierre algo como
  // "buen estado" sin que alguien lo haya mirado.
  const handleRecibirEquipos = () => {
    if (!data) return;
    const activos = data.employee.assignments.filter((a) => a.activo && !a.estadoDevolucion);
    const devoluciones = activos
      .filter((a) => devolucionEstados[a.id])
      .map((a) => ({
        assignmentId: a.id,
        estadoDevolucion: devolucionEstados[a.id],
        observaciones: devolucionObservaciones[a.id] || undefined,
      }));
    const devolucionesEpp = eppPendienteDevolver
      .filter((k) => devolucionEppEstados[k.id])
      .map((k) => ({
        kitAssignmentId: k.id,
        estadoDevolucion: devolucionEppEstados[k.id],
        observaciones: devolucionEppObservaciones[k.id] || undefined,
      }));
    handleTransition('equipo_recibido', { devoluciones, devolucionesEpp });
  };

  // Etapa "Gestion TI" del onboarding: si la solicitud recien fue recibida,
  // primero avanza a gestion_ti. La entrega de equipos puede ser parcial --
  // se registran los que si hay disponibles y la solicitud se queda en
  // Gestion TI para completar el resto despues, en vez de bloquear todo el
  // paso por un solo producto sin stock. Cuando ya se cubrieron todas las
  // categorias requeridas, se cierra la etapa automaticamente.
  const handleEntregarEquipos = async (
    assetIds: string[],
    condicionCargador?: Record<string, { condicion: 'ok' | 'danado' | 'no_aplica'; observaciones?: string }>
  ) => {
    if (!data) return;
    setTransitioning(true);
    setError('');
    setFieldErrors({});
    try {
      if (data.estado === 'solicitud_recibida') {
        const resGestion = await fetch(`/api/solicitudes/${id}/transicion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nuevoEstado: 'gestion_ti' }),
        });
        if (!resGestion.ok) {
          const { message, fieldErrors: fe } = await parseApiError(resGestion, 'Error al avanzar a Gestión TI');
          setFieldErrors(fe);
          throw new Error(message);
        }
      }

      if (assetIds.length > 0) {
        const resEntrega = await fetch(`/api/solicitudes/${id}/transicion`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nuevoEstado: 'gestion_ti',
            datosAccion: { assetIds, condicionCargador },
          }),
        });
        if (!resEntrega.ok) {
          const { message, fieldErrors: fe } = await parseApiError(resEntrega, 'Error al entregar equipos');
          setFieldErrors(fe);
          throw new Error(message);
        }
      }

      // Ya no se cierra Gestion TI automaticamente aca: una vez cubiertas
      // todas las categorias, la solicitud se queda en gestion_ti y la UI
      // muestra el boton "Coordinar Entrega" para que el tecnico complete
      // fecha/hora y medio de entrega -- ese paso necesita datos que no se
      // pueden completar solos.
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setTransitioning(false);
    }
  };

  // Etapa "Incidencia Detectada" del cambio de equipo: el tecnico elige que
  // asignacion activa del empleado se devuelve y que activo nuevo se entrega,
  // y ambos datos se mandan juntos en la misma transicion de estado.
  const handleCambiarEquipo = async (
    oldAssignmentId: string,
    newAssetId: string,
    estadoDevolucion: 'ok' | 'danado' | 'no_devuelto',
    observacionesDevolucion: string
  ) => {
    setTransitioning(true);
    setError('');
    setFieldErrors({});
    try {
      const res = await fetch(`/api/solicitudes/${id}/transicion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nuevoEstado: 'cambio_ejecutado',
          datosAccion: {
            oldAssignmentId,
            newAssetId,
            estadoDevolucion,
            observacionesDevolucion: observacionesDevolucion || undefined,
          },
        }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, 'Error al ejecutar el cambio de equipo');
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

  // Kit de Bienvenida / EPP: cuanto se ha entregado ya para esta solicitud
  // (independiente del estado del ticket -- puede entregarse en cualquier
  // momento mientras la solicitud siga abierta).
  const kitEntregadoTotal = (categoria: 'kit_bienvenida' | 'epp') =>
    data.kitAssignments
      .filter((ka) => ka.item.categoria === categoria)
      .reduce((sum, ka) => sum + ka.cantidad, 0);

  // Si se pidio Kit de Bienvenida y/o EPP pero todavia no se entrego nada,
  // no deberia poder cerrarse el ticket -- quedaria "pendiente" sin que
  // nada lo refleje. La entrega en si sigue siendo independiente del estado
  // (se puede hacer en cualquier momento), solo el cierre final la exige.
  // Por categoria: si hay detalle articulo-por-articulo (kitRequeridos) para
  // esa categoria se usa ese chequeo (mas preciso); si no hay ninguna fila
  // para esa categoria puntual, se cae al chequeo antiguo por booleano --
  // nunca se ignora un booleano solo porque la OTRA categoria si tenga
  // detalle granular (por ejemplo, EPP con stock y Kit sin stock al crear
  // el ticket).
  const kitRequeridosPendientes =
    data.tipo === 'onboarding'
      ? data.kitRequeridos.filter(
          (r) => r.item.categoria === 'kit_bienvenida' && r.estado === 'pendiente'
        )
      : [];
  const eppRequeridosPendientes =
    data.tipo === 'onboarding'
      ? data.kitRequeridos.filter((r) => r.item.categoria === 'epp' && r.estado === 'pendiente')
      : [];
  const kitTieneGranular =
    data.tipo === 'onboarding' && data.kitRequeridos.some((r) => r.item.categoria === 'kit_bienvenida');
  const eppTieneGranular =
    data.tipo === 'onboarding' && data.kitRequeridos.some((r) => r.item.categoria === 'epp');
  const kitBienvenidaPendiente = kitTieneGranular
    ? kitRequeridosPendientes.length > 0
    : data.tipo === 'onboarding' &&
      data.kitBienvenidaSolicitado &&
      kitEntregadoTotal('kit_bienvenida') === 0;
  const eppPendiente = eppTieneGranular
    ? eppRequeridosPendientes.length > 0
    : data.tipo === 'onboarding' && data.eppSolicitado && kitEntregadoTotal('epp') === 0;
  const kitOEppPendiente = kitBienvenidaPendiente || eppPendiente;

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
              {data.estado === 'cancelada' ? (
                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-200 text-gray-700">
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
            <p className="text-gray-600">{tipoLabels[data.tipo]}</p>
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
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-gray-900">Cancelar solicitud</h3>
            <p className="text-sm text-gray-500">
              Esta solicitud todavía no ejecutó ninguna acción sobre el inventario, así que se
              puede cancelar directamente. Se registrará en el historial del ticket con el motivo
              que indiques.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo *</label>
              <textarea
                value={motivoCancelacion}
                onChange={(e) => setMotivoCancelacion(e.target.value)}
                placeholder="Ej: Ticket duplicado, ya no corresponde..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={handleCancelar}
                disabled={cancelling || !motivoCancelacion.trim()}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

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
          data.estado === 'solicitud_recibida' &&
          data.categoriasRequeridas.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Gestión TI</h3>
              <p className="text-sm text-gray-500 mb-3">
                Esta solicitud no marcó ningún equipo como requerido. Continúa para coordinar la
                entrega (del Kit de Bienvenida / EPP, si corresponde).
              </p>
              <button
                onClick={() => handleEntregarEquipos([])}
                disabled={transitioning}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
                {transitioning ? 'Avanzando...' : 'No requiere equipo, continuar'}
              </button>
            </div>
          ) : data.tipo === 'onboarding' && !isClosed &&
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
                Ya se cubrieron todas las categorías requeridas. Continúa para coordinar la entrega.
              </p>
              <button
                onClick={() => handleTransition('coordinando_entrega')}
                disabled={transitioning}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <ChevronRight className="h-4 w-4" />
                {transitioning ? 'Avanzando...' : 'Coordinar Entrega'}
              </button>
            </div>
          ) : data.tipo === 'onboarding' && !isClosed && data.estado === 'coordinando_entrega' ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Coordinar Entrega</h3>
              <p className="text-sm text-gray-500 mb-3">
                Define cuándo y cómo se le hará llegar el equipo a {data.employee.nombres}{' '}
                {data.employee.apellidoPaterno}.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {medioEntrega === 'presencial' ? 'Fecha y hora de entrega' : 'Fecha y hora de entrega estimada'}
                  </label>
                  <input
                    type="datetime-local"
                    value={fechaEntregaCoordinada}
                    onChange={(e) => setFechaEntregaCoordinada(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medio</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="medioEntrega"
                        checked={medioEntrega === 'presencial'}
                        onChange={() => setMedioEntrega('presencial')}
                      />
                      Presencial
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="medioEntrega"
                        checked={medioEntrega === 'chilexpress'}
                        onChange={() => setMedioEntrega('chilexpress')}
                      />
                      Despacho (Chilexpress)
                    </label>
                  </div>
                </div>
                {medioEntrega === 'presencial' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lugar de entrega
                    </label>
                    <input
                      type="text"
                      value={lugarEntrega}
                      onChange={(e) => setLugarEntrega(e.target.value)}
                      placeholder="ej: Oficina Santiago, piso 4"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        N° de OT Chilexpress
                      </label>
                      <input
                        type="text"
                        value={otChilexpressEntrega}
                        onChange={(e) => setOtChilexpressEntrega(e.target.value)}
                        placeholder="ej: CH-2026-004567"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ubicación de destino
                      </label>
                      <input
                        type="text"
                        value={ciudadEntrega}
                        onChange={(e) => setCiudadEntrega(e.target.value)}
                        placeholder="ej: Hotel HD Express, Concepción"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
                <button
                  onClick={handleCoordinarEntrega}
                  disabled={transitioning}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                  {transitioning ? 'Guardando...' : 'Confirmar Entrega Coordinada'}
                </button>
              </div>
            </div>
          ) : data.tipo === 'cambio_equipo' && !isClosed && data.estado === 'incidencia_detectada' ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Coordinar Cambio</h3>
              <p className="text-sm text-gray-500 mb-3">
                Define cuándo y cómo se hará el cambio de equipo a {data.employee.nombres}{' '}
                {data.employee.apellidoPaterno}, antes de ejecutarlo.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {medioCambio === 'presencial' ? 'Fecha y hora del cambio' : 'Fecha estimada de llegada'}
                  </label>
                  <input
                    type="datetime-local"
                    value={fechaCambioCoordinada}
                    onChange={(e) => setFechaCambioCoordinada(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medio</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="medioCambio"
                        checked={medioCambio === 'presencial'}
                        onChange={() => setMedioCambio('presencial')}
                      />
                      Presencial
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="medioCambio"
                        checked={medioCambio === 'chilexpress'}
                        onChange={() => setMedioCambio('chilexpress')}
                      />
                      Despacho (Chilexpress)
                    </label>
                  </div>
                </div>
                {medioCambio === 'presencial' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lugar del cambio
                    </label>
                    <input
                      type="text"
                      value={lugarCambio}
                      onChange={(e) => setLugarCambio(e.target.value)}
                      placeholder="ej: Oficina Santiago, piso 4"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        N° de OT Chilexpress
                      </label>
                      <input
                        type="text"
                        value={otCambioChilexpress}
                        onChange={(e) => setOtCambioChilexpress(e.target.value)}
                        placeholder="ej: CH-2026-004567"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ciudad destino
                      </label>
                      <input
                        type="text"
                        value={ciudadCambio}
                        onChange={(e) => setCiudadCambio(e.target.value)}
                        placeholder="ej: Concepción"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
                <button
                  onClick={handleCoordinarCambio}
                  disabled={transitioning}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                  {transitioning ? 'Guardando...' : 'Confirmar Coordinación'}
                </button>
              </div>
            </div>
          ) : data.tipo === 'cambio_equipo' && !isClosed && data.estado === 'coordinando_cambio' ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Cambio de Equipo</h3>
              <p className="text-sm text-gray-500 mb-3">
                Elige que equipo de {data.employee.nombres} {data.employee.apellidoPaterno} se va a
                cambiar y con que equipo nuevo se reemplaza.
              </p>
              <SeleccionarCambioEquipo
                asignacionesActivas={data.employee.assignments}
                submitting={transitioning}
                onSubmit={handleCambiarEquipo}
              />
            </div>
          ) : data.tipo === 'onboarding' && !isClosed && data.estado === 'equipos_entregados' ? (
            <div className={cn(
              'border rounded-lg p-4',
              kitOEppPendiente ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
            )}>
              <h3 className={cn('font-medium mb-2', kitOEppPendiente ? 'text-amber-900' : 'text-green-900')}>
                Equipos entregados
              </h3>
              {kitOEppPendiente ? (
                <p className="text-sm text-amber-700 mb-3">
                  {[...kitRequeridosPendientes, ...eppRequeridosPendientes].length > 0 &&
                    `Aún falta entregar (o marcar como "No aplica"): ${[
                      ...kitRequeridosPendientes,
                      ...eppRequeridosPendientes,
                    ]
                      .map((r) => r.item.nombre)
                      .join(', ')}. `}
                  {(!kitTieneGranular && kitBienvenidaPendiente) || (!eppTieneGranular && eppPendiente)
                    ? `Aún falta entregar ${[
                        !kitTieneGranular && kitBienvenidaPendiente && 'el Kit de Bienvenida',
                        !eppTieneGranular && eppPendiente && 'el EPP',
                      ]
                        .filter(Boolean)
                        .join(' y ')}. `
                    : ''}
                  Ver la tarjeta &quot;Artículos Requeridos&quot; y/o &quot;Kit de Bienvenida y EPP&quot;
                  más abajo.
                </p>
              ) : (
                <p className="text-sm text-green-700 mb-3">
                  Listo para cerrar el ticket.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`/api/solicitudes/${data.id}/documento/comprobante-entrega`}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Generar plantilla
                </a>
                <button
                  onClick={() => handleTransition('registro_rrhh')}
                  disabled={transitioning || kitOEppPendiente}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                  {transitioning ? 'Cerrando...' : 'Cerrar ticket'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Descarga el comprobante con los datos ya rellenados para adjuntarlo al aviso a RRHH.
              </p>
            </div>
          ) : data.tipo === 'offboarding' && !isClosed && data.estado === 'solicitud_emitida' ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Coordinar Devolución</h3>
              <p className="text-sm text-gray-500 mb-3">
                Define cuándo y cómo {data.employee.nombres} {data.employee.apellidoPaterno} va a
                devolver sus equipos, antes de recibirlos.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {medioDevolucion === 'presencial' ? 'Fecha y hora de la devolución' : 'Fecha estimada de llegada'}
                  </label>
                  <input
                    type="datetime-local"
                    value={fechaDevolucionCoordinada}
                    onChange={(e) => setFechaDevolucionCoordinada(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medio</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="medioDevolucion"
                        checked={medioDevolucion === 'presencial'}
                        onChange={() => setMedioDevolucion('presencial')}
                      />
                      Presencial
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="medioDevolucion"
                        checked={medioDevolucion === 'chilexpress'}
                        onChange={() => setMedioDevolucion('chilexpress')}
                      />
                      Despacho (Chilexpress)
                    </label>
                  </div>
                </div>
                {medioDevolucion === 'presencial' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Lugar de la devolución
                    </label>
                    <input
                      type="text"
                      value={lugarDevolucion}
                      onChange={(e) => setLugarDevolucion(e.target.value)}
                      placeholder="ej: Oficina Santiago, piso 4"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        N° de OT Chilexpress
                      </label>
                      <input
                        type="text"
                        value={otChilexpressDevolucion}
                        onChange={(e) => setOtChilexpressDevolucion(e.target.value)}
                        placeholder="ej: CH-2026-004567"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ciudad destino
                      </label>
                      <input
                        type="text"
                        value={ciudadDevolucion}
                        onChange={(e) => setCiudadDevolucion(e.target.value)}
                        placeholder="ej: Concepción"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
                <button
                  onClick={handleCoordinarDevolucion}
                  disabled={transitioning}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <ChevronRight className="h-4 w-4" />
                  {transitioning ? 'Guardando...' : 'Confirmar Coordinación'}
                </button>
              </div>
            </div>
          ) : data.tipo === 'offboarding' && !isClosed && data.estado === 'coordinacion_en_curso' ? (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-1">Recibir Equipos</h3>
              <p className="text-sm text-gray-500 mb-3">
                Califica el estado de cada equipo que devuelve {data.employee.nombres}{' '}
                {data.employee.apellidoPaterno}. Los dañados se dan de baja automáticamente; el
                resto queda reutilizable.
              </p>
              {(() => {
                // "no_devuelto" deja la asignacion activa a proposito (el
                // empleado se queda con el equipo) -- ya fue calificada en
                // este ticket, asi que no se vuelve a pedir aca; se muestra
                // aparte, de solo lectura, mas abajo.
                const yaCalificadasNoDevueltas = data.employee.assignments.filter(
                  (a) => a.activo && a.estadoDevolucion === 'no_devuelto'
                );
                const pendientesDeCalificar = data.employee.assignments.filter(
                  (a) => a.activo && !a.estadoDevolucion
                );
                return (
                  <>
                    {pendientesDeCalificar.length === 0 && yaCalificadasNoDevueltas.length === 0 ? (
                      <p className="text-sm text-gray-500 mb-3">
                        Este empleado no tiene equipos asignados actualmente.
                      </p>
                    ) : pendientesDeCalificar.length === 0 ? (
                      <p className="text-sm text-gray-500 mb-3">
                        No queda ningún equipo por calificar.
                      </p>
                    ) : (
                <div className="space-y-3 mb-3">
                  {pendientesDeCalificar
                    .map((a) => (
                      <div key={a.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              {a.asset.marca} {a.asset.modelo}
                            </span>
                            <span className="block text-xs text-gray-500">
                              {a.asset.categoria.nombre}
                              {a.asset.numeroSerie && ` · S/N: ${a.asset.numeroSerie}`}
                            </span>
                          </div>
                          <div className="flex gap-3">
                            <label className="flex items-center gap-1 text-sm">
                              <input
                                type="radio"
                                name={`devolucion-${a.id}`}
                                checked={devolucionEstados[a.id] === 'ok'}
                                onChange={() =>
                                  setDevolucionEstados((prev) => ({ ...prev, [a.id]: 'ok' }))
                                }
                              />
                              Buen estado
                            </label>
                            <label className="flex items-center gap-1 text-sm">
                              <input
                                type="radio"
                                name={`devolucion-${a.id}`}
                                checked={devolucionEstados[a.id] === 'danado'}
                                onChange={() =>
                                  setDevolucionEstados((prev) => ({ ...prev, [a.id]: 'danado' }))
                                }
                              />
                              Dañado
                            </label>
                            <label className="flex items-center gap-1 text-sm">
                              <input
                                type="radio"
                                name={`devolucion-${a.id}`}
                                checked={devolucionEstados[a.id] === 'no_devuelto'}
                                onChange={() =>
                                  setDevolucionEstados((prev) => ({ ...prev, [a.id]: 'no_devuelto' }))
                                }
                              />
                              No devolvió
                            </label>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={devolucionObservaciones[a.id] || ''}
                          onChange={(e) =>
                            setDevolucionObservaciones((prev) => ({ ...prev, [a.id]: e.target.value }))
                          }
                          placeholder="Observaciones (opcional)"
                          className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                        />
                      </div>
                    ))}
                </div>
                    )}
                    {yaCalificadasNoDevueltas.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {yaCalificadasNoDevueltas.map((a) => (
                          <div
                            key={a.id}
                            className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-900">
                                {a.asset.marca} {a.asset.modelo}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 flex-shrink-0">
                                No devolvió
                              </span>
                            </div>
                            <span className="block text-xs text-gray-500 mt-0.5">
                              {a.asset.categoria.nombre}
                              {a.asset.numeroSerie && ` · S/N: ${a.asset.numeroSerie}`} · Sigue
                              asignado a {data.employee.nombres}, a la espera de recuperarlo.
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
              {eppPendienteDevolver.length > 0 && (
                <div className="space-y-3 mb-3">
                  <h4 className="text-sm font-medium text-gray-700">EPP a devolver</h4>
                  {eppPendienteDevolver.map((k) => (
                    <div key={k.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-900">{k.item.nombre}</span>
                        <div className="flex gap-3">
                          <label className="flex items-center gap-1 text-sm">
                            <input
                              type="radio"
                              name={`devolucion-epp-${k.id}`}
                              checked={devolucionEppEstados[k.id] === 'ok'}
                              onChange={() =>
                                setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: 'ok' }))
                              }
                            />
                            Buen estado
                          </label>
                          <label className="flex items-center gap-1 text-sm">
                            <input
                              type="radio"
                              name={`devolucion-epp-${k.id}`}
                              checked={devolucionEppEstados[k.id] === 'danado'}
                              onChange={() =>
                                setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: 'danado' }))
                              }
                            />
                            Dañado
                          </label>
                          <label className="flex items-center gap-1 text-sm">
                            <input
                              type="radio"
                              name={`devolucion-epp-${k.id}`}
                              checked={devolucionEppEstados[k.id] === 'no_devuelto'}
                              onChange={() =>
                                setDevolucionEppEstados((prev) => ({ ...prev, [k.id]: 'no_devuelto' }))
                              }
                            />
                            No devolvió
                          </label>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={devolucionEppObservaciones[k.id] || ''}
                        onChange={(e) =>
                          setDevolucionEppObservaciones((prev) => ({ ...prev, [k.id]: e.target.value }))
                        }
                        placeholder="Observaciones (opcional)"
                        className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    </div>
                  ))}
                </div>
              )}
              {(() => {
                const activosSinCalificar = data.employee.assignments
                  .filter((a) => a.activo && !a.estadoDevolucion)
                  .filter((a) => !devolucionEstados[a.id]).length;
                const eppSinCalificar = eppPendienteDevolver.filter(
                  (k) => !devolucionEppEstados[k.id]
                ).length;
                const faltanPorCalificar = activosSinCalificar + eppSinCalificar;
                return (
                  <>
                    {faltanPorCalificar > 0 && (
                      <p className="text-xs text-amber-700 mb-2">
                        Falta calificar {faltanPorCalificar} ítem(s) (elige un estado para cada
                        uno, o &ldquo;No devolvió&rdquo; si corresponde).
                      </p>
                    )}
                    <button
                      onClick={handleRecibirEquipos}
                      disabled={transitioning || faltanPorCalificar > 0}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                      {transitioning ? 'Guardando...' : 'Confirmar Recepción'}
                    </button>
                  </>
                );
              })()}
            </div>
          ) : data.tipo === 'offboarding' && !isClosed && data.estado === 'equipo_recibido' ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-medium text-green-900 mb-2">Equipos recibidos</h3>
              <p className="text-sm text-green-700 mb-3">
                Listo para cerrar el ticket.
              </p>
              <button
                onClick={() => handleTransition('consolidacion_cierre')}
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
                <div key={categoria} className="bg-white rounded-lg shadow p-6">
                  <h3 className="font-semibold text-gray-900 mb-1">Artículos Requeridos: {label}</h3>
                  <p className="text-sm text-gray-500 mb-3">
                    {label} pedido específicamente para este ticket.
                  </p>
                  <div className="space-y-2">
                    {requeridos.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0"
                      >
                        <div>
                          <span className="text-sm text-gray-900">
                            {r.item.nombre} × {r.cantidad}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {r.estado === 'no_aplica' && r.motivoNoAplica ? r.motivoNoAplica : ''}
                          </span>
                        </div>
                        {r.estado === 'pendiente' && !isClosed ? (
                          <button
                            onClick={() => handleMarcarNoAplica(r.id)}
                            disabled={marcandoNoAplica === r.id}
                            className="text-xs px-2 py-1 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
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
                                  ? 'bg-gray-100 text-gray-600'
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
                    <div key={categoria} className="bg-white rounded-lg shadow p-6">
                      <h3 className="font-semibold text-gray-900 mb-1">{label}</h3>
                      <p className="text-sm text-gray-500 mb-3">
                        Elige los artículos y cantidades a entregar a {data.employee.nombres}{' '}
                        {data.employee.apellidoPaterno}.
                      </p>
                      {items.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No hay artículos cargados en el catálogo de {label}. Puedes crearlos en
                          Configuración → Kit de Bienvenida y EPP.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {items.map((it) => (
                            <div key={it.id} className="flex items-center justify-between gap-3 py-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-900">{it.nombre}</span>
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
                                className="w-20 text-sm border border-gray-300 rounded px-2 py-1 disabled:bg-gray-100"
                              />
                            </div>
                          ))}
                          <button
                            onClick={() => handleEntregarKit(categoria)}
                            disabled={
                              entregandoKit === categoria ||
                              items.every((it) => !(kitCantidades[it.id] > 0))
                            }
                            className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
                  {data.employee.rut || '—'} · {data.employee.correoPersonal}
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
                </>
              )}
              {data.tipo === 'offboarding' && (
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
                      <dt className="text-gray-500">Ubicación</dt>
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

          {/* Equipos Devueltos: lo que ya se recibio y califico en este
              ticket de offboarding, con su estado y observaciones -- para
              que quede a la vista sin tener que ir al modulo de
              Asignaciones a buscar cada asignacion por separado. */}
          {data.tipo === 'offboarding' && data.equiposDevueltos.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Equipos Devueltos</h3>
              <div className="space-y-2">
                {data.equiposDevueltos.map((a) => (
                  <div key={a.id} className="text-sm p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        {a.asset.categoria.nombre}: {a.asset.marca} {a.asset.modelo}
                      </span>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded flex-shrink-0',
                          a.estadoDevolucion === 'danado'
                            ? 'bg-red-100 text-red-700'
                            : a.estadoDevolucion === 'no_devuelto'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-700'
                        )}
                      >
                        {a.estadoDevolucion === 'danado'
                          ? 'Dañado'
                          : a.estadoDevolucion === 'no_devuelto'
                            ? 'No devolvió'
                            : 'Buen estado'}
                      </span>
                    </div>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {a.asset.numeroSerie && `S/N: ${a.asset.numeroSerie} · `}
                      {a.estadoDevolucion === 'no_devuelto'
                        ? 'Sigue asignado, a la espera de recuperarlo'
                        : a.fechaDevolucion &&
                          `Devuelto el ${new Date(a.fechaDevolucion).toLocaleDateString('es-CL')}`}
                      {a.recibidoPor && ` · Registrado por ${a.recibidoPor}`}
                    </span>
                    {a.observacionesDevolucion && (
                      <p className="text-xs text-gray-600 mt-1">
                        Observaciones: {a.observacionesDevolucion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EPP Devuelto: mismo criterio que Equipos Devueltos, pero para
              el EPP (el Kit de Bienvenida no se devuelve). El estado y las
              observaciones quedan en KitAssignment.observaciones porque no
              hay un campo aparte como en Assignment. */}
          {data.tipo === 'offboarding' && data.eppDevueltos.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">EPP Devuelto</h3>
              <div className="space-y-2">
                {data.eppDevueltos.map((k) => (
                  <div key={k.id} className="text-sm p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">{k.item.nombre}</span>
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
                      <p className="text-xs text-gray-600 mt-1">{k.observaciones}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Equipo Cambiado: equipo anterior (con la condicion en que se
              devolvio) y equipo nuevo entregado en este ticket de cambio de
              equipo. */}
          {data.tipo === 'cambio_equipo' && (data.equipoCambioAnterior || data.equipoCambioNuevo) && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Equipo Cambiado</h3>
              <div className="space-y-3">
                {data.equipoCambioAnterior && (
                  <div className="text-sm p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        Anterior: {data.equipoCambioAnterior.asset.categoria.nombre}
                        {' — '}
                        {data.equipoCambioAnterior.asset.marca} {data.equipoCambioAnterior.asset.modelo}
                      </span>
                      <span
                        className={cn(
                          'text-xs px-1.5 py-0.5 rounded flex-shrink-0',
                          data.equipoCambioAnterior.estadoDevolucion === 'danado'
                            ? 'bg-red-100 text-red-700'
                            : data.equipoCambioAnterior.estadoDevolucion === 'no_devuelto'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-green-100 text-green-700'
                        )}
                      >
                        {data.equipoCambioAnterior.estadoDevolucion === 'danado'
                          ? 'Dañado'
                          : data.equipoCambioAnterior.estadoDevolucion === 'no_devuelto'
                            ? 'No devolvió'
                            : 'Buen estado'}
                      </span>
                    </div>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {data.equipoCambioAnterior.asset.numeroSerie &&
                        `S/N: ${data.equipoCambioAnterior.asset.numeroSerie} · `}
                      {data.equipoCambioAnterior.estadoDevolucion === 'no_devuelto'
                        ? 'Sigue asignado, a la espera de recuperarlo'
                        : data.equipoCambioAnterior.fechaDevolucion &&
                          `Devuelto el ${new Date(data.equipoCambioAnterior.fechaDevolucion).toLocaleDateString('es-CL')}`}
                      {data.equipoCambioAnterior.recibidoPor &&
                        ` · Registrado por ${data.equipoCambioAnterior.recibidoPor}`}
                    </span>
                    {data.equipoCambioAnterior.observacionesDevolucion && (
                      <p className="text-xs text-gray-600 mt-1">
                        Observaciones: {data.equipoCambioAnterior.observacionesDevolucion}
                      </p>
                    )}
                  </div>
                )}
                {data.equipoCambioNuevo && (
                  <div className="text-sm p-3 bg-green-50 rounded-lg">
                    <span className="font-medium text-gray-900">
                      Nuevo: {data.equipoCambioNuevo.asset.categoria.nombre}
                      {' — '}
                      {data.equipoCambioNuevo.asset.marca} {data.equipoCambioNuevo.asset.modelo}
                    </span>
                    <span className="block text-xs text-gray-500 mt-0.5">
                      {data.equipoCambioNuevo.asset.numeroSerie &&
                        `S/N: ${data.equipoCambioNuevo.asset.numeroSerie} · `}
                      Entregado el {new Date(data.equipoCambioNuevo.fechaEntrega).toLocaleDateString('es-CL')}
                      {data.equipoCambioNuevo.entregadoPor && ` · Por ${data.equipoCambioNuevo.entregadoPor}`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Entrega Coordinada: fecha/hora y medio (presencial/despacho)
              definidos en la etapa "Coordinando Entrega". Tarjeta aparte para
              que se vea de un vistazo, igual que Equipos Asignados. */}
          {data.tipo === 'onboarding' && data.fechaEntregaCoordinada && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Entrega Coordinada</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">
                    {data.medioEntrega === 'presencial' ? 'Fecha y Hora' : 'Fecha y Hora Estimada'}
                  </dt>
                  <dd className="text-gray-900">
                    {new Date(data.fechaEntregaCoordinada).toLocaleString('es-CL')}
                  </dd>
                </div>
                {data.medioEntrega && (
                  <div>
                    <dt className="text-gray-500">Medio</dt>
                    <dd className="text-gray-900">
                      {data.medioEntrega === 'presencial' ? 'Presencial' : 'Despacho (Chilexpress)'}
                    </dd>
                  </div>
                )}
                {data.lugarEntrega && (
                  <div>
                    <dt className="text-gray-500">Lugar</dt>
                    <dd className="text-gray-900">{data.lugarEntrega}</dd>
                  </div>
                )}
                {data.otChilexpressEntrega && (
                  <div>
                    <dt className="text-gray-500">OT Chilexpress</dt>
                    <dd className="text-gray-900">{data.otChilexpressEntrega}</dd>
                  </div>
                )}
                {data.ciudadEntrega && (
                  <div>
                    <dt className="text-gray-500">Ubicación de destino</dt>
                    <dd className="text-gray-900">{data.ciudadEntrega}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Cambio Coordinado: mismo patron que Entrega Coordinada, para
              cambio_equipo. */}
          {data.tipo === 'cambio_equipo' && data.fechaCambioCoordinada && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Cambio Coordinado</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">
                    {data.medioCambio === 'presencial' ? 'Fecha y Hora' : 'Fecha Estimada de Llegada'}
                  </dt>
                  <dd className="text-gray-900">
                    {new Date(data.fechaCambioCoordinada).toLocaleString('es-CL')}
                  </dd>
                </div>
                {data.medioCambio && (
                  <div>
                    <dt className="text-gray-500">Medio</dt>
                    <dd className="text-gray-900">
                      {data.medioCambio === 'presencial' ? 'Presencial' : 'Despacho (Chilexpress)'}
                    </dd>
                  </div>
                )}
                {data.lugarCambio && (
                  <div>
                    <dt className="text-gray-500">Lugar</dt>
                    <dd className="text-gray-900">{data.lugarCambio}</dd>
                  </div>
                )}
                {data.otCambioChilexpress && (
                  <div>
                    <dt className="text-gray-500">OT Chilexpress</dt>
                    <dd className="text-gray-900">{data.otCambioChilexpress}</dd>
                  </div>
                )}
                {data.ciudadCambio && (
                  <div>
                    <dt className="text-gray-500">Ciudad destino</dt>
                    <dd className="text-gray-900">{data.ciudadCambio}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Devolución Coordinada: mismo patron, para offboarding. */}
          {data.tipo === 'offboarding' && data.fechaDevolucionCoordinada && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Devolución Coordinada</h3>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">
                    {data.medioDevolucion === 'presencial' ? 'Fecha y Hora' : 'Fecha Estimada de Llegada'}
                  </dt>
                  <dd className="text-gray-900">
                    {new Date(data.fechaDevolucionCoordinada).toLocaleString('es-CL')}
                  </dd>
                </div>
                {data.medioDevolucion && (
                  <div>
                    <dt className="text-gray-500">Medio</dt>
                    <dd className="text-gray-900">
                      {data.medioDevolucion === 'presencial' ? 'Presencial' : 'Despacho (Chilexpress)'}
                    </dd>
                  </div>
                )}
                {data.lugarDevolucion && (
                  <div>
                    <dt className="text-gray-500">Lugar</dt>
                    <dd className="text-gray-900">{data.lugarDevolucion}</dd>
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
                    <dt className="text-gray-500">Ciudad destino</dt>
                    <dd className="text-gray-900">{data.ciudadDevolucion}</dd>
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
              <div key={categoria} className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold text-gray-900 mb-4">{label}</h3>
                <div className="space-y-2">
                  {entregas.map((ka) => (
                    <div key={ka.id} className="text-sm p-2 bg-gray-50 rounded">
                      <span className="font-medium">
                        {ka.item.nombre} × {ka.cantidad}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {new Date(ka.createdAt).toLocaleDateString('es-CL')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

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
