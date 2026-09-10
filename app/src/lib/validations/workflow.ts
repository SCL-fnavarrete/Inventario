import { z } from 'zod';
import { createEmployeeSchema, TipoContratoEnum } from './employee';

// Enums que coinciden con Prisma
export const TipoSolicitudEnum = z.enum(['onboarding', 'cambio_equipo', 'offboarding']);
export const EstadoSolicitudEnum = z.enum([
  'solicitud_recibida',
  'gestion_ti',
  'coordinando_entrega',
  'equipos_entregados',
  'registro_rrhh',
  'incidencia_detectada',
  'coordinando_cambio',
  'cambio_ejecutado',
  'confirmacion_rrhh',
  'solicitud_emitida',
  'coordinacion_en_curso',
  'equipo_recibido',
  'consolidacion_cierre',
  // Cancelación: no es una transición normal (no pasa por
  // workflowStateMachine.canTransition) -- se llega a este estado solo via
  // POST /api/solicitudes/[id]/cancelar, con cancelWorkflowRequestSchema
  // abajo, nunca via transitionSchema.
  'cancelada',
]);
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
  'epp',
  'otro',
]);
export const EstadoPendienteEnum = z.enum(['pendiente', 'gestionando', 'entregado', 'no_aplica']);

// Base fields shared by all request types
const baseRequestFields = {
  // Opcional porque un onboarding puede traer "nuevoEmpleado" en su lugar.
  // Cada tipo valida abajo (superRefine) que venga uno de los dos.
  employeeId: z.string().uuid('ID de empleado inválido').optional(),
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
  // En onboarding el empleado normalmente todavia no existe. Se manda entero
  // aca y el servidor lo crea dentro de la MISMA transaccion que la
  // solicitud: si algo falla no queda ni el empleado ni el ticket. Se acepta
  // igual un employeeId ya existente (empleado que se vuelve a contratar).
  nuevoEmpleado: createEmployeeSchema.optional(),
  // Solo aplica cuando employeeId apunta a un empleado ya existente
  // (reincorporacion): el tipo de contrato pudo cambiar desde la vez
  // anterior, asi que se puede actualizar al crear el ticket. Para
  // nuevoEmpleado el tipo de contrato ya viene dentro de ese objeto.
  tipoContrato: TipoContratoEnum.optional(),
  fechaIngreso: z.string().min(1, 'Fecha de ingreso requerida').transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error('Fecha de ingreso inválida');
    return date;
  }),
  cargoSolicitado: z.string().min(1, 'Cargo requerido').max(200),
  ubicacionDestino: z.string().max(200).optional().nullable(),
  categoriasRequeridas: z.array(z.string().min(1)).default([]),
  // Si al crear la solicitud ya hay stock disponible, el tecnico puede elegir
  // de una los equipos especificos (no solo la categoria) y quedan
  // reservados (Activo -> asignado) desde ese momento, sin pasar por Gestion
  // TI. Si falta alguna categoria por asignar, la solicitud igual entra a
  // Gestion TI para completar el resto cuando haya stock.
  assetIdsSeleccionados: z.array(z.string().uuid()).optional().default([]),
  // Kit de Bienvenida y EPP viven aparte de categoriasRequeridas: estos dos
  // flags son la intencion (si corresponde entregar o no). Si ademas hay
  // stock, se pueden elegir articulos y cantidades especificas de una vez
  // (kitItemsSeleccionados) y quedan reservados desde que se crea el ticket,
  // igual que assetIdsSeleccionados para los equipos.
  kitBienvenidaSolicitado: z.boolean().optional().default(false),
  eppSolicitado: z.boolean().optional().default(false),
  kitItemsSeleccionados: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        cantidad: z.coerce.number().int().min(1),
      })
    )
    .optional()
    .default([]),
  // Articulos concretos de Kit/EPP que este onboarding necesita. A diferencia
  // de kitItemsSeleccionados (que se entregan de una), estos son la lista de
  // lo que "falta": el ticket no cierra mientras alguno siga pendiente. Lo
  // que se entrega al crear queda marcado como entregado de inmediato.
  kitItemsRequeridos: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        cantidad: z.coerce.number().int().min(1).default(1),
      })
    )
    .optional()
    .default([]),
});

// Cambio equipo fields
const cambioEquipoFields = z.object({
  tipo: z.literal('cambio_equipo'),
  ...baseRequestFields,
  // A diferencia de onboarding, aca el empleado siempre existe de antes.
  employeeId: z.string().uuid('ID de empleado inválido'),
  motivoCambio: z.string().min(1, 'Motivo de cambio requerido'),
  // Si al crear el ticket ya se eligio el equipo viejo a devolver, el estado
  // en que vuelve y el equipo nuevo de reemplazo, el cambio se ejecuta de
  // inmediato (ver POST /api/solicitudes) y el ticket arranca directo en
  // "cambio_ejecutado" en vez de "incidencia_detectada". Los cuatro campos
  // son opcionales pero van juntos -- el superRefine de mas abajo exige que,
  // si viene alguno, vengan los tres obligatorios (oldAssignmentId,
  // newAssetId, estadoDevolucionAnterior).
  oldAssignmentId: z.string().uuid('ID de asignación inválido').optional(),
  newAssetId: z.string().uuid('ID de activo inválido').optional(),
  estadoDevolucionAnterior: z.enum(['ok', 'danado', 'no_devuelto']).optional(),
  observacionesDevolucionAnterior: z.string().optional().nullable(),
});

// Devolución por término fields
const devolucionTerminoFields = z.object({
  tipo: z.literal('offboarding'),
  ...baseRequestFields,
  // Igual que en cambio_equipo: el empleado ya existe de antes.
  employeeId: z.string().uuid('ID de empleado inválido'),
  fechaDesvinculacion: z.string().min(1, 'Fecha de desvinculación requerida').transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error('Fecha de desvinculación inválida');
    return date;
  }),
  medioDevolucion: z.string().max(100).optional().nullable(),
  otChilexpress: z.string().max(100).optional().nullable(),
  ciudadDevolucion: z.string().max(200).optional().nullable(),
  // Si el tecnico ya tiene los equipos en mano al momento de crear el
  // ticket (caso presencial tipico), puede calificar cada uno de una y el
  // ticket se salta equipo_recibido, cerrandose directo (consolidacion_cierre)
  // -- igual que si hiciera las dos transiciones por separado despues.
  devoluciones: z
    .array(
      z.object({
        assignmentId: z.string().uuid(),
        estadoDevolucion: z.enum(['ok', 'danado', 'no_devuelto']),
        observaciones: z.string().optional().nullable(),
      })
    )
    .optional()
    .default([]),
  // Mismo caso pero para EPP entregado (KitAssignment) -- el Kit de
  // Bienvenida no se devuelve, solo el EPP.
  devolucionesEpp: z
    .array(
      z.object({
        kitAssignmentId: z.string().uuid(),
        estadoDevolucion: z.enum(['ok', 'danado', 'no_devuelto']),
        observaciones: z.string().optional().nullable(),
      })
    )
    .optional()
    .default([]),
});

// Discriminated union schema for creating workflow requests
export const createWorkflowRequestSchema = z
  .discriminatedUnion('tipo', [onboardingFields, cambioEquipoFields, devolucionTerminoFields])
  // Solo onboarding puede traer el empleado "entero" en vez de un id (cambio
  // de equipo y offboarding son siempre sobre alguien que ya existe, y ya lo
  // exigen en su propio schema). En onboarding tiene que venir uno de los dos.
  .superRefine((data, ctx) => {
    if (data.tipo === 'onboarding' && !data.employeeId && !data.nuevoEmpleado) {
      ctx.addIssue({
        code: 'custom',
        path: ['employeeId'],
        message: 'Falta el empleado: manda un employeeId o los datos del nuevo empleado',
      });
    }
    if (data.tipo === 'cambio_equipo') {
      const algunoCompleto = Boolean(
        data.oldAssignmentId || data.newAssetId || data.estadoDevolucionAnterior
      );
      const todoCompleto = Boolean(
        data.oldAssignmentId && data.newAssetId && data.estadoDevolucionAnterior
      );
      if (algunoCompleto && !todoCompleto) {
        ctx.addIssue({
          code: 'custom',
          path: ['newAssetId'],
          message:
            'Para ejecutar el cambio al crear el ticket hacen falta el equipo viejo, el nuevo y el estado en que vuelve el equipo viejo',
        });
      }
    }
  });

// Schema for cancelling a request (ver POST /api/solicitudes/[id]/cancelar).
// Solo permitido mientras la solicitud no ejecuto ningun efecto secundario
// (assignmentIds/kitReturnIds vacios) -- eso lo valida la ruta, no aca.
export const cancelWorkflowRequestSchema = z.object({
  motivo: z.string().min(1, 'El motivo de cancelación es obligatorio').max(1000),
});

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
  responsableActualId: z.string().uuid().optional().nullable(),
  observaciones: z.string().optional().nullable(),
});

// Schema for list filters
export const workflowFiltersSchema = z.object({
  search: z.string().optional(),
  tipo: TipoSolicitudEnum.optional(),
  // El dashboard de Solicitudes ya no filtra por el estado interno detallado
  // (solicitud_recibida, gestion_ti, etc.) -- solo por si el ticket sigue
  // abierto o ya se cerro (fechaCierre). Los estados detallados se siguen
  // usando internamente para el flujo/Kanban, pero no como filtro de la lista.
  estado: z.enum(['abierto', 'cerrado']).optional(),
  responsableActualId: z.string().uuid().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Inferred types
export type CreateWorkflowRequestInput = z.infer<typeof createWorkflowRequestSchema>;
export type TransitionInput = z.infer<typeof transitionSchema>;
export type CancelWorkflowRequestInput = z.infer<typeof cancelWorkflowRequestSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdatePendienteInput = z.infer<typeof updatePendienteSchema>;
export type UpdateWorkflowRequestInput = z.infer<typeof updateWorkflowRequestSchema>;
export type WorkflowFilters = z.infer<typeof workflowFiltersSchema>;
