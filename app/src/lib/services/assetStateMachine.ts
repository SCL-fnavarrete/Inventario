import { EstadoActivo } from '@prisma/client';

// SPEC: Sección 2.7 — Máquina de Estados del Ciclo de Vida de Activos

type TransitionRule = {
  to: EstadoActivo;
  description: string;
};

export type TransitionContext = {
  hasActiveAssignment: boolean;
  hasActiveMaintenance: boolean;
  motivo?: string;
  estadoDevolucion?: string;
};

type ValidationResult = {
  valid: boolean;
  errors: string[];
};

// SPEC: Sección 2.7.2 — Tabla de transiciones válidas
const ASSET_TRANSITIONS: Record<EstadoActivo, TransitionRule[]> = {
  disponible: [
    { to: 'asignado', description: 'Asignar a empleado' },
    { to: 'en_mantencion', description: 'Enviar a mantención' },
    { to: 'baja', description: 'Dar de baja sin uso previo' },
  ],
  asignado: [
    // 15-sep-2026 (SPEC 2.40): devolver en buen estado deja el equipo en
    // "disponible", no en el extinto "reutilizable". Ese estado era
    // indistinguible de disponible para entregar (el formulario de
    // asignacion aceptaba los dos) pero NO contaba como stock en las
    // alertas del Dashboard: con equipos devueltos listos para entregar,
    // el sistema igual avisaba "Sin Stock". Que el equipo sea usado lo
    // dice `condicion`, que es un campo aparte.
    { to: 'disponible', description: 'Devolver equipo (ok/incompleto)' },
    { to: 'baja', description: 'Devolver equipo (dañado) → baja' },
    { to: 'en_mantencion', description: 'Enviar a mantención' },
    // 20-sep-2026 (SPEC 2.57): el empleado se desvincula y no devuelve el
    // equipo. Antes esto se manejaba dejando el Activo en "asignado" (ver
    // executeReturn) para no perderle el rastro; ahora es un estado propio,
    // para que se pueda contar y filtrar aparte de las asignaciones vigentes.
    { to: 'no_devuelto', description: 'Empleado desvinculado sin devolver el equipo' },
  ],
  en_mantencion: [
    { to: 'disponible', description: 'Mantención completada (sin asignación previa)' },
    { to: 'asignado', description: 'Mantención completada (con asignación previa)' },
    { to: 'baja', description: 'Mantención: no reparable' },
  ],
  baja: [{ to: 'vendido', description: 'Registrar venta' }],
  vendido: [], // Estado terminal
  no_devuelto: [
    { to: 'disponible', description: 'Equipo recuperado en buen estado' },
    { to: 'baja', description: 'Equipo dado por perdido' },
  ],
};

// SPEC: Sección 2.7.2 — Precondiciones por transición
const TRANSITION_PRECONDITIONS: Record<string, (ctx: TransitionContext) => string[]> = {
  'asignado→baja': (ctx) => {
    const errors: string[] = [];
    if (ctx.hasActiveAssignment && ctx.estadoDevolucion !== 'danado') {
      errors.push('Requiere devolución con estado "dañado" para dar de baja un activo asignado');
    }
    return errors;
  },
  'asignado→disponible': (ctx) => {
    const errors: string[] = [];
    if (ctx.hasActiveAssignment && !ctx.estadoDevolucion) {
      errors.push('Requiere registrar devolución del equipo');
    }
    if (ctx.estadoDevolucion === 'danado') {
      errors.push('Equipo dañado no puede volver a disponible, debe ir a baja');
    }
    return errors;
  },
    'disponible→baja': (ctx) => {
    const errors: string[] = [];
    if (!ctx.motivo) {
      errors.push('Requiere motivo obligatorio para dar de baja');
    }
    return errors;
  },
  'en_mantencion→baja': (ctx) => {
    const errors: string[] = [];
    if (!ctx.motivo) {
      errors.push('Requiere motivo obligatorio (resultado no_reparable)');
    }
    return errors;
  },
  'baja→vendido': (ctx) => {
    const errors: string[] = [];
    if (!ctx.motivo) {
      errors.push('Requiere datos de venta (comprador, monto, fecha)');
    }
    return errors;
  },
  'asignado→no_devuelto': (ctx) => {
    const errors: string[] = [];
    if (!ctx.motivo) {
      errors.push('Requiere motivo (ej. desvinculación sin devolución del equipo)');
    }
    return errors;
  },
  'no_devuelto→disponible': (ctx) => {
    const errors: string[] = [];
    if (!ctx.motivo) {
      errors.push('Requiere indicar cómo se recuperó el equipo');
    }
    return errors;
  },
  'no_devuelto→baja': (ctx) => {
    const errors: string[] = [];
    if (!ctx.motivo) {
      errors.push('Requiere motivo obligatorio para dar por perdido el equipo');
    }
    return errors;
  },
};

export function canTransitionAsset(from: EstadoActivo, to: EstadoActivo): boolean {
  const transitions = ASSET_TRANSITIONS[from];
  return transitions.some((t) => t.to === to);
}

export function getValidTransitions(from: EstadoActivo): EstadoActivo[] {
  return ASSET_TRANSITIONS[from].map((t) => t.to);
}

export function getTransitionDescription(from: EstadoActivo, to: EstadoActivo): string {
  const transition = ASSET_TRANSITIONS[from].find((t) => t.to === to);
  return transition?.description ?? 'Transición no válida';
}

export function validateTransition(
  from: EstadoActivo,
  to: EstadoActivo,
  context: TransitionContext
): ValidationResult {
  // Verificar que la transición es válida
  if (!canTransitionAsset(from, to)) {
    return {
      valid: false,
      errors: [`Transición no permitida: ${from} → ${to}`],
    };
  }

  // Verificar precondiciones específicas
  const key = `${from}→${to}`;
  const preconditionFn = TRANSITION_PRECONDITIONS[key];
  if (preconditionFn) {
    const errors = preconditionFn(context);
    if (errors.length > 0) {
      return { valid: false, errors };
    }
  }

  return { valid: true, errors: [] };
}

export function isTerminalState(estado: EstadoActivo): boolean {
  return ASSET_TRANSITIONS[estado].length === 0;
}
