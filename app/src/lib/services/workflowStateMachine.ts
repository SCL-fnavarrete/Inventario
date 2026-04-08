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
      to: 'equipos_entregados',
      roles: ['tecnico', 'admin'],
    },
    {
      from: 'equipos_entregados',
      to: 'registro_rrhh',
      roles: ['rrhh', 'admin'],
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
      roles: ['rrhh', 'admin'],
    },
  ],
  devolucion_termino: [
    {
      from: 'solicitud_emitida',
      to: 'coordinacion_en_curso',
      roles: ['tecnico', 'admin'],
    },
    {
      from: 'coordinacion_en_curso',
      to: 'equipo_recibido',
      roles: ['tecnico', 'admin'],
    },
    {
      from: 'equipo_recibido',
      to: 'consolidacion_cierre',
      roles: ['rrhh', 'admin'],
    },
  ],
};

const INITIAL_STATES: Record<TipoSolicitud, EstadoSolicitud> = {
  onboarding: 'solicitud_recibida',
  cambio_equipo: 'incidencia_detectada',
  devolucion_termino: 'solicitud_emitida',
};

const FINAL_STATES: Record<TipoSolicitud, EstadoSolicitud> = {
  onboarding: 'registro_rrhh',
  cambio_equipo: 'confirmacion_rrhh',
  devolucion_termino: 'consolidacion_cierre',
};

const STATES_BY_TYPE: Record<TipoSolicitud, EstadoSolicitud[]> = {
  onboarding: [
    'solicitud_recibida',
    'gestion_ti',
    'equipos_entregados',
    'registro_rrhh',
  ],
  cambio_equipo: ['incidencia_detectada', 'cambio_ejecutado', 'confirmacion_rrhh'],
  devolucion_termino: [
    'solicitud_emitida',
    'coordinacion_en_curso',
    'equipo_recibido',
    'consolidacion_cierre',
  ],
};

export const STATE_LABELS: Record<EstadoSolicitud, string> = {
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
