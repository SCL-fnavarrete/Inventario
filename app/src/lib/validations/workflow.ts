import { z } from 'zod';
import { pngSignatureSchema, policyAcceptanceSchema } from './signature';

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
  requiereNotebook: z.boolean().default(false),
  requiereCelular: z.boolean().default(false),
  requiereMonitor: z.boolean().default(false),
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

const uuid = z.string().uuid('ID inválido');
const estadoDevolucion = z.enum(['ok', 'danado', 'incompleto']);
const estadoDevolucionTermino = z.enum(['ok', 'danado', 'no_aplica', 'pendiente']);

const deliveryActionSchema = z
  .object({
    assetIds: z.array(uuid).min(1, 'Debe seleccionar al menos un activo'),
    lugarEntrega: z.string().min(1, 'Lugar de entrega requerido').max(100),
    firmaEmpleadoEntrega: pngSignatureSchema,
    aceptaPoliticaUso: policyAcceptanceSchema,
  })
  .strict();

const returnActionSchema = z
  .object({
    terminationId: uuid,
    estadoNotebook: estadoDevolucionTermino,
    estadoCelular: estadoDevolucionTermino,
    estadoMonitor: estadoDevolucionTermino,
    estadoKit: estadoDevolucionTermino,
    lugarDevolucion: z.string().min(1, 'Lugar de devolución requerido').max(100),
    firmaEmpleadoDevolucion: pngSignatureSchema,
    aceptaPoliticaUso: policyAcceptanceSchema,
  })
  .strict();

const changeActionSchema = z
  .object({
    oldAssignmentId: uuid.optional(),
    estadoDevolucion: estadoDevolucion.optional(),
    newAssetId: uuid.optional(),
    lugarEntrega: z.string().min(1).max(100).optional(),
    firmaEmpleadoEntrega: pngSignatureSchema.optional(),
    firmaEmpleadoDevolucion: pngSignatureSchema.optional(),
    aceptaPoliticaUso: policyAcceptanceSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.oldAssignmentId && !data.newAssetId) {
      ctx.addIssue({ code: 'custom', message: 'El cambio requiere devolución, entrega o ambas' });
    }
    if (data.oldAssignmentId && (!data.estadoDevolucion || !data.firmaEmpleadoDevolucion)) {
      ctx.addIssue({
        code: 'custom',
        path: ['firmaEmpleadoDevolucion'],
        message: 'La devolución requiere estado y firma',
      });
    }
    if (data.newAssetId && (!data.lugarEntrega || !data.firmaEmpleadoEntrega)) {
      ctx.addIssue({
        code: 'custom',
        path: ['firmaEmpleadoEntrega'],
        message: 'La entrega requiere lugar y firma',
      });
    }
  });

const logisticsActionSchema = z
  .object({
    medioDevolucion: z.string().min(1).max(100).optional(),
    otChilexpress: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine((data) => data.medioDevolucion || data.otChilexpress, {
    message: 'Debe indicar al menos un dato de coordinación',
  });

const commonTransitionFields = {
  comentario: z.string().max(2000).optional().nullable(),
};

// The action data is a closed discriminated union. A caller cannot smuggle a
// client timestamp, a loose policy flag, or fields belonging to another effect.
export const transitionSchema = z.discriminatedUnion('nuevoEstado', [
  z.object({ nuevoEstado: z.literal('gestion_ti'), ...commonTransitionFields }).strict(),
  z.object({ nuevoEstado: z.literal('registro_rrhh'), ...commonTransitionFields }).strict(),
  z.object({ nuevoEstado: z.literal('confirmacion_rrhh'), ...commonTransitionFields }).strict(),
  z.object({ nuevoEstado: z.literal('coordinacion_en_curso'), ...commonTransitionFields }).strict(),
  z
    .object({
      nuevoEstado: z.literal('equipos_entregados'),
      ...commonTransitionFields,
      datosAccion: deliveryActionSchema,
    })
    .strict(),
  z
    .object({
      nuevoEstado: z.literal('cambio_ejecutado'),
      ...commonTransitionFields,
      datosAccion: changeActionSchema,
    })
    .strict(),
  z
    .object({
      nuevoEstado: z.literal('equipo_recibido'),
      ...commonTransitionFields,
      datosAccion: logisticsActionSchema.optional(),
    })
    .strict(),
  z
    .object({
      nuevoEstado: z.literal('consolidacion_cierre'),
      ...commonTransitionFields,
      datosAccion: returnActionSchema,
    })
    .strict(),
]);

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
