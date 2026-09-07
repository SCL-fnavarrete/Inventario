import { z } from 'zod';

// Enums que coinciden con Prisma
export const TipoSolicitudEnum = z.enum(['onboarding', 'cambio_equipo', 'devolucion_termino']);
export const EstadoSolicitudEnum = z.enum([
  'solicitud_recibida',
  'gestion_ti',
  'equipos_entregados',
  'registro_rrhh',
  'incidencia_detectada',
  'cambio_ejecutado',
  'confirmacion_rrhh',
  'solicitud_emitida',
  'coordinacion_en_curso',
  'equipo_recibido',
  'consolidacion_cierre',
]);
export const PrioridadSolicitudEnum = z.enum(['baja', 'media', 'alta', 'urgente']);
export const TipoPendienteEnum = z.enum([
  'celular',
  'audifonos',
  'mochila',
  'cargador',
  'epp_zapatos',
  'epp_chaleco',
  'epp_casco',
  'epp_lentes',
  'kit_bienvenida',
  'otro',
]);
export const EstadoPendienteEnum = z.enum(['pendiente', 'gestionando', 'entregado', 'no_aplica']);

// Base fields shared by all request types
const baseRequestFields = {
  employeeId: z.string().uuid('ID de empleado inválido'),
  prioridad: PrioridadSolicitudEnum.optional().default('media'),
  observaciones: z.string().optional().nullable(),
  responsableActualId: z
    .union([z.string().uuid(), z.literal(''), z.null()])
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
  pendientes: z
    .array(
      z.object({
        tipo: TipoPendienteEnum,
        descripcion: z.string().optional().nullable(),
      })
    )
    .optional(),
};

// Onboarding-specific fields
const onboardingFields = z.object({
  tipo: z.literal('onboarding'),
  ...baseRequestFields,
  fechaIngreso: z.string().min(1, 'Fecha de ingreso requerida').transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error('Fecha de ingreso inválida');
    return date;
  }),
  cargoSolicitado: z.string().min(1, 'Cargo requerido').max(200),
  ubicacionDestino: z.string().max(200).optional().nullable(),
  categoriasRequeridas: z.array(z.string().min(1)).default([]),
});

// Cambio equipo fields
const cambioEquipoFields = z.object({
  tipo: z.literal('cambio_equipo'),
  ...baseRequestFields,
  ticketFreshdesk: z.string().max(100).optional().nullable(),
  motivoCambio: z.string().min(1, 'Motivo de cambio requerido'),
});

// Devolución por término fields
const devolucionTerminoFields = z.object({
  tipo: z.literal('devolucion_termino'),
  ...baseRequestFields,
  fechaDesvinculacion: z.string().min(1, 'Fecha de desvinculación requerida').transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error('Fecha de desvinculación inválida');
    return date;
  }),
  medioDevolucion: z.string().max(100).optional().nullable(),
  otChilexpress: z.string().max(100).optional().nullable(),
  ciudadDevolucion: z.string().max(200).optional().nullable(),
});

// Discriminated union schema for creating workflow requests
export const createWorkflowRequestSchema = z.discriminatedUnion('tipo', [
  onboardingFields,
  cambioEquipoFields,
  devolucionTerminoFields,
]);

// Schema for transitioning state
export const transitionSchema = z.object({
  nuevoEstado: EstadoSolicitudEnum,
  comentario: z.string().optional().nullable(),
  datosAccion: z.record(z.string(), z.unknown()).optional().nullable(),
});

// Schema for creating comments
export const createCommentSchema = z.object({
  mensaje: z.string().min(1, 'El mensaje es requerido').max(2000),
  esInterno: z.boolean().default(false),
});

// Schema for updating a pendiente
export const updatePendienteSchema = z.object({
  estado: EstadoPendienteEnum,
  descripcion: z.string().optional().nullable(),
});

// Schema for updating request metadata
export const updateWorkflowRequestSchema = z.object({
  prioridad: PrioridadSolicitudEnum.optional(),
  responsableActualId: z.string().uuid().optional().nullable(),
  observaciones: z.string().optional().nullable(),
});

// Schema for list filters
export const workflowFiltersSchema = z.object({
  search: z.string().optional(),
  tipo: TipoSolicitudEnum.optional(),
  estado: EstadoSolicitudEnum.optional(),
  prioridad: PrioridadSolicitudEnum.optional(),
  responsableActualId: z.string().uuid().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.enum(['createdAt', 'updatedAt', 'prioridad']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Inferred types
export type CreateWorkflowRequestInput = z.infer<typeof createWorkflowRequestSchema>;
export type TransitionInput = z.infer<typeof transitionSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdatePendienteInput = z.infer<typeof updatePendienteSchema>;
export type UpdateWorkflowRequestInput = z.infer<typeof updateWorkflowRequestSchema>;
export type WorkflowFilters = z.infer<typeof workflowFiltersSchema>;
