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
  ],
  asignado: [
    { to: 'reutilizable', description: 'Devolver equipo (ok/incompleto)' },
    { to: 'baja', description: 'Devolver equipo (dañado) → baja' },
    { to: 'en_mantencion', description: 'Enviar a mantención' },
  ],
  en_mantencion: [
    { to: 'disponible', description: 'Mantención completada (sin asignación previa)' },
    { to: 'asignado', description: 'Mantención completada (con asignación previa)' },
    { to: 'baja', description: 'Mantención: no reparable' },
  ],
  reutilizable: [
    { to: 'asignado', description: 'Reasignar a empleado' },
    { to: 'disponible', description: 'Pasar a disponible' },
    { to: 'baja', description: 'Dar de baja' },
  ],
  baja: [{ to: 'vendido', description: 'Registrar venta' }],
  vendido: [], // Estado terminal
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
  'asignado→reutilizable': (ctx) => {
    const errors: string[] = [];
    if (ctx.hasActiveAssignment && !ctx.estadoDevolucion) {
      errors.push('Requiere registrar devolución del equipo');
    }
    if (ctx.estadoDevolucion === 'danado') {
      errors.push('Equipo dañado no puede ir a reutilizable, debe ir a baja');
    }
    return errors;
  },
  'reutilizable→baja': (ctx) => {
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
