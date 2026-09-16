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
      // Fecha/medio/lugar de entrega se piden junto con la entrega de
      // equipos, en la misma transicion -- ya no hay una etapa
      // "coordinando_entrega" aparte (15-sep-2026, SPEC 2.42).
      from: 'gestion_ti',
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
      // Coordinacion (fecha/lugar presencial, u OT + fecha estimada de
      // llegada) y ejecucion del cambio se piden juntas, en la misma
      // transicion -- ya no hay una etapa "coordinando_cambio" aparte
      // (15-sep-2026, SPEC 2.42). Los campos vienen de SPEC 2.5.2 regla 9.
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
  offboarding: [
    {
      // Coordinacion de la devolucion y recepcion de los equipos se piden
      // juntas, en la misma transicion -- ya no hay una etapa
      // "coordinacion_en_curso" aparte (15-sep-2026, SPEC 2.42). Los campos
      // vienen de SPEC 2.5.2 regla 9.
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
  onboarding: ['solicitud_recibida', 'gestion_ti', 'equipos_entregados', 'registro_rrhh'],
  cambio_equipo: ['incidencia_detectada', 'cambio_ejecutado', 'confirmacion_rrhh'],
  offboarding: ['solicitud_emitida', 'equipo_recibido', 'consolidacion_cierre'],
};

export const STATE_LABELS: Record<EstadoSolicitud, string> = {
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
