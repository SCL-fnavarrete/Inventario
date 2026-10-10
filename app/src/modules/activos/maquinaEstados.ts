import { EstadoActivo } from '@prisma/client';

// Máquina de estados del ciclo de vida de activos.

type TransitionRule = {
  to: EstadoActivo;
  description: string;
};

export type TransitionContext = {
  hasActiveAssignment: boolean;
  hasActiveMaintenance: boolean;
  motivo?: string;
  estadoDevolucion?: string;
  /**
   * SPEC 2.111.4: el equipo se perdio en un despacho (baja por Extravio) y
   * aparecio. Es el unico caso en que una baja se revierte.
   */
  aparecioEnDespacho?: boolean;
};

type ValidationResult = {
  valid: boolean;
  errors: string[];
};

// Tabla de transiciones válidas por estado.
const ASSET_TRANSITIONS: Record<EstadoActivo, TransitionRule[]> = {
  disponible: [
    { to: 'asignado', description: 'Asignar a empleado' },
    { to: 'en_mantencion', description: 'Enviar a mantención' },
    { to: 'baja', description: 'Dar de baja sin uso previo' },
    { to: 'en_transito', description: 'Enviar a otra sede en un despacho' },
  ],
  asignado: [
    // Devolver en buen estado deja el equipo en "disponible": ese es el
    // unico estado que cuenta como stock disponible. Que el equipo sea
    // usado lo indica `condicion`, un campo aparte.
    { to: 'disponible', description: 'Devolver equipo (ok/incompleto)' },
    { to: 'baja', description: 'Dar de baja (devolución dañada, o para dar de baja en un cambio)' },
    { to: 'en_mantencion', description: 'Enviar a mantención' },
    // Empleado se desvincula sin devolver el equipo: estado propio para
    // poder contarlo y filtrarlo aparte de las asignaciones vigentes.
    { to: 'no_devuelto', description: 'Empleado desvinculado sin devolver el equipo' },
  ],
  en_mantencion: [
    { to: 'disponible', description: 'Mantención completada (sin asignación previa)' },
    { to: 'asignado', description: 'Mantención completada (con asignación previa)' },
    { to: 'baja', description: 'Mantención: no reparable' },
  ],
  baja: [
    // SPEC 2.111.4: solo un equipo perdido en un despacho que aparecio.
    { to: 'disponible', description: 'Apareció un equipo perdido en un despacho' },
  ],
  // SPEC 2.108: llega (disponible en la sede destino), se anula la guia
  // (disponible en origen) o se pierde (baja por Extravio).
  en_transito: [
    { to: 'disponible', description: 'Llegó a la sede destino, o se anuló el despacho' },
    { to: 'baja', description: 'Se perdió en el despacho' },
    // SPEC 2.111.5: se anulo el despacho de un reparto; se reparte de nuevo.
    { to: 'por_repartir', description: 'Se anuló el despacho del reparto' },
  ],
  // SPEC 2.111: recien comprado, espera en la sede de llegada. Solo sale
  // al repartirlo, desde su compra.
  por_repartir: [
    { to: 'disponible', description: 'Repartido a la sede de llegada' },
    { to: 'en_transito', description: 'Repartido a otra sede: sale en un despacho' },
  ],
  no_devuelto: [
    { to: 'disponible', description: 'Equipo recuperado en buen estado' },
    // SPEC 2.87: recuperado danado, pasa a evaluacion como cualquier
    // devolucion danada.
    { to: 'en_mantencion', description: 'Equipo recuperado dañado: a evaluación' },
    { to: 'baja', description: 'Equipo dado por perdido' },
  ],
};

// Precondiciones por transición.
const TRANSITION_PRECONDITIONS: Record<string, (ctx: TransitionContext) => string[]> = {
  'asignado→baja': (ctx) => {
    const errors: string[] = [];
    // "baja": devuelto en un cambio de equipo para darlo de baja, con motivo (SPEC 2.126).
    if (ctx.hasActiveAssignment && ctx.estadoDevolucion !== 'danado' && ctx.estadoDevolucion !== 'baja') {
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
      errors.push('Equipo dañado no puede volver a disponible, debe ir a mantención');
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
  'en_transito→baja': (ctx) => {
    const errors: string[] = [];
    if (!ctx.motivo) {
      errors.push('Requiere motivo obligatorio (equipo perdido en el despacho)');
    }
    return errors;
  },
  'baja→disponible': (ctx) => {
    const errors: string[] = [];
    if (!ctx.aparecioEnDespacho) {
      errors.push(
        'Una baja solo se revierte si el equipo se perdió en un despacho y apareció (se hace desde el despacho)'
      );
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
