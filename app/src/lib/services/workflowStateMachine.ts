import {
  TipoSolicitud,
  EstadoSolicitud,
  SystemRole,
} from '@prisma/client';

type TransitionRule = {
  from: EstadoSolicitud;
  to: EstadoSolicitud;
  roles: SystemRole[];
};

const TRANSITIONS: Record<TipoSolicitud, TransitionRule[]> = {
  onboarding: [
    {
      from: 'solicitud_recibida',
      to: 'gestion_ti',
      roles: ['tecnico', 'admin'],
    },
    {
      from: 'gestion_ti',
      to: 'coordinando_entrega',
      roles: ['tecnico', 'admin'],
    },
    {
      from: 'coordinando_entrega',
      to: 'equipos_entregados',
      roles: ['tecnico', 'admin'],
    },
    {
      from: 'equipos_entregados',
      to: 'registro_rrhh',
      // RRHH no usa este sistema: el cierre lo hace soporte. El estado
      // conserva su nombre historico para no romper los tickets ya cerrados.
      roles: ['tecnico', 'admin'],
    },
  ],
  cambio_equipo: [
    {
      from: 'incidencia_detectada',
      to: 'cambio_ejecutado',
      roles: ['tecnico', 'admin'],
    },
    {
      from: 'cambio_ejecutado',
      to: 'confirmacion_rrhh',
      // Igual que en onboarding: cierra soporte, no RRHH.
      roles: ['tecnico', 'admin'],
    },
  ],
  // La coordinacion de devolucion (medio, OT Chilexpress, ciudad/ubicacion)
  // ya se captura al crear la solicitud -- no hace falta una etapa aparte
  // para eso. El flujo queda en 3 pasos: se emite la solicitud, se reciben
  // los equipos (calificando el estado de cada uno), se cierra.
  offboarding: [
    {
      from: 'solicitud_emitida',
      to: 'equipo_recibido',
      roles: ['tecnico', 'admin'],
    },
    {
      from: 'equipo_recibido',
      to: 'consolidacion_cierre',
      // RRHH no usa este sistema -- es soporte/tecnico quien cierra el ticket.
      roles: ['tecnico', 'admin'],
    },
  ],
};

const INITIAL_STATES: Record<TipoSolicitud, EstadoSolicitud> = {
  onboarding: 'solicitud_recibida',
  cambio_equipo: 'incidencia_detectada',
  offboarding: 'solicitud_emitida',
};

const FINAL_STATES: Record<TipoSolicitud, EstadoSolicitud> = {
  onboarding: 'registro_rrhh',
  cambio_equipo: 'confirmacion_rrhh',
  offboarding: 'consolidacion_cierre',
};

const STATES_BY_TYPE: Record<TipoSolicitud, EstadoSolicitud[]> = {
  onboarding: [
    'solicitud_recibida',
    'gestion_ti',
    'coordinando_entrega',
    'equipos_entregados',
    'registro_rrhh',
  ],
  cambio_equipo: ['incidencia_detectada', 'cambio_ejecutado', 'confirmacion_rrhh'],
  offboarding: ['solicitud_emitida', 'equipo_recibido', 'consolidacion_cierre'],
};

export const STATE_LABELS: Record<EstadoSolicitud, string> = {
  solicitud_recibida: 'Solicitud Recibida',
  gestion_ti: 'Gestión TI',
  coordinando_entrega: 'Coordinando Entrega',
  equipos_entregados: 'Equipos Entregados',
  registro_rrhh: 'Ticket Cerrado',
  incidencia_detectada: 'Incidencia Detectada',
  cambio_ejecutado: 'Cambio Ejecutado',
  confirmacion_rrhh: 'Ticket Cerrado',
  solicitud_emitida: 'Solicitud Emitida',
  coordinacion_en_curso: 'Coordinación en Curso',
  equipo_recibido: 'Equipo Recibido',
  consolidacion_cierre: 'Consolidación y Cierre',
  cancelada: 'Cancelada',
};

// Cancelación: no es una transición del diagrama normal (no pasa por
// TRANSITIONS/canTransition) -- es una accion aparte, solo disponible
// mientras la solicitud no ejecuto ningun efecto secundario todavia. Ver
// POST /api/solicitudes/[id]/cancelar y SPEC 2.5.2/2.5.3.
export function isCancelled(estado: EstadoSolicitud): boolean {
  return estado === 'cancelada';
}

export function getInitialState(tipo: TipoSolicitud): EstadoSolicitud {
  return INITIAL_STATES[tipo];
}

export function isFinalState(tipo: TipoSolicitud, estado: EstadoSolicitud): boolean {
  return FINAL_STATES[tipo] === estado;
}

export function getStatesForType(tipo: TipoSolicitud): EstadoSolicitud[] {
  return STATES_BY_TYPE[tipo];
}

export function getNextStates(
  tipo: TipoSolicitud,
  estadoActual: EstadoSolicitud,
  rol: SystemRole
): EstadoSolicitud[] {
  return TRANSITIONS[tipo]
    .filter((t) => t.from === estadoActual && t.roles.includes(rol))
    .map((t) => t.to);
}

export function canTransition(
  tipo: TipoSolicitud,
  from: EstadoSolicitud,
  to: EstadoSolicitud,
  rol: SystemRole
): boolean {
  return TRANSITIONS[tipo].some(
    (t) => t.from === from && t.to === to && t.roles.includes(rol)
  );
}
