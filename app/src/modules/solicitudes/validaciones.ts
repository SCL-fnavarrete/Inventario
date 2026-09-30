import { z } from 'zod';
import { cantidad, textoLibre } from "@/shared/validaciones/comunes";
import { createEmployeeSchema, TipoContratoEnum } from '@/modules/personas';
import { condicionCargadorSchema } from '@/modules/activos';

// Enums que coinciden con Prisma
export const TipoSolicitudEnum = z.enum(['onboarding', 'cambio_equipo', 'offboarding']);
// La coordinacion de fecha/medio/lugar se pide junto con la
// asignacion/ejecucion del equipo, no como etapa aparte. Ver maquinaEstados.ts.
export const EstadoSolicitudEnum = z.enum([
  'solicitud_recibida',
  'gestion_ti',
  'equipos_entregados',
  'registro_rrhh',
  'incidencia_detectada',
  'cambio_ejecutado',
  'confirmacion_rrhh',
  'solicitud_emitida',
  'equipo_recibido',
  'consolidacion_cierre',
  // Cancelación: no es una transición normal (no pasa por
  // workflowStateMachine.canTransition), se llega solo via
  // POST /api/solicitudes/[id]/cancelar (cancelWorkflowRequestSchema).
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

// Ticket de la ticketera que origina la solicitud (SPEC 2.123): texto libre,
// obligatorio, y una vez puesto no se puede dejar vacio.
const idTicket = z
  .string({ error: 'Escribe el ID del ticket' })
  .trim()
  .min(1, 'Escribe el ID del ticket')
  .max(50, 'Máximo 50 caracteres');

// Base fields shared by all request types
const baseRequestFields = {
  idTicket,
  // Opcional porque un onboarding puede traer "nuevoEmpleado" en su lugar.
  // Cada tipo valida abajo (superRefine) que venga uno de los dos.
  employeeId: z.string().uuid('ID de empleado inválido').optional(),
  observaciones: textoLibre(),
  responsableActualId: z
    .union([z.string().uuid(), z.literal(''), z.null()])
    .optional()
    .transform((val) => (val && val.length > 0 ? val : null)),
  pendientes: z
    .array(
      z.object({
        tipo: TipoPendienteEnum,
        descripcion: textoLibre(500),
      })
    )
    .optional(),
};

// Onboarding-specific fields
const onboardingFields = z.object({
  tipo: z.literal('onboarding'),
  ...baseRequestFields,
  // En onboarding el empleado normalmente todavia no existe: se manda
  // entero y el servidor lo crea en la misma transaccion que la solicitud.
  // Tambien se acepta un employeeId existente (reincorporacion).
  nuevoEmpleado: createEmployeeSchema.optional(),
  // Solo aplica en reincorporacion (employeeId existente): permite
  // actualizar el tipo de contrato al crear el ticket.
  tipoContrato: TipoContratoEnum.optional(),
  fechaIngreso: z.string().min(1, 'Fecha de ingreso requerida').transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error('Fecha de ingreso inválida');
    return date;
  }),
  cargoSolicitado: z.string().trim().min(1, 'Cargo requerido').max(200),
  ubicacionDestino: z.string().max(200).optional().nullable(),
  categoriasRequeridas: z.array(z.string().min(1)).default([]),
  // Si hay stock disponible al crear la solicitud, se pueden elegir equipos
  // especificos de una vez (quedan reservados sin pasar por Gestion TI); si
  // falta alguna categoria, la solicitud entra a Gestion TI igual.
  assetIdsSeleccionados: z.array(z.string().uuid()).optional().default([]),
  // Condicion del cargador por activo reservado: mapa assetId -> {condicion,
  // observaciones}. Solo se guarda si el activo es un notebook con
  // tieneCargador, se ignora si no.
  condicionCargadorPorAsset: z
    .record(
      z.string().uuid(),
      z.object({
        condicion: condicionCargadorSchema,
        observaciones: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
      })
    )
    .optional()
    .default({}),
  // Coordinacion de entrega: si los equipos elegidos cubren todas las
  // categorias requeridas, el ticket nace directo en "Equipos Entregados"
  // en vez de pasar por Gestion TI; si no, estos campos igual se guardan.
  fechaEntregaCoordinada: z.string().optional().nullable(),
  medioEntrega: z.enum(['presencial', 'chilexpress']).optional().nullable(),
  lugarEntrega: z.string().max(200).optional().nullable(),
  otChilexpressEntrega: z.string().max(100).optional().nullable(),
  ciudadEntrega: z.string().max(200).optional().nullable(),
  // Kit de Bienvenida y EPP viven aparte de categoriasRequeridas: estos dos
  // flags indican si corresponde entregar. Con stock disponible se pueden
  // elegir articulos y cantidades (kitItemsSeleccionados), reservados igual
  // que assetIdsSeleccionados.
  kitBienvenidaSolicitado: z.boolean().optional().default(false),
  eppSolicitado: z.boolean().optional().default(false),
  kitItemsSeleccionados: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        cantidad: cantidad(1, "La cantidad debe ser al menos 1"),
      })
    )
    .optional()
    .default([]),
  // Articulos de Kit/EPP que este onboarding necesita: a diferencia de
  // kitItemsSeleccionados, estos son lo que "falta" y el ticket no cierra
  // mientras alguno siga pendiente.
  kitItemsRequeridos: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        cantidad: cantidad(1, "La cantidad debe ser al menos 1").default(1),
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
  motivoCambio: z.string().trim().min(1, 'Motivo de cambio requerido').max(1000),
  // Uno o varios equipos a cambiar (SPEC 2.84), cada uno con su reemplazo:
  // se ejecutan de inmediato al crear la solicitud (ver POST /api/solicitudes).
  cambios: z
    .array(
      z.object({
        oldAssignmentId: z.string().uuid('ID de asignación inválido'),
        newAssetId: z.string().uuid('ID de activo inválido'),
        estadoDevolucion: z.enum(['ok', 'danado', 'no_devuelto']),
        observacionesDevolucion: z.string().optional().nullable(),
        // Condicion del cargador: solo aplica si el equipo es un notebook con
        // tieneCargador. "Anterior" es el del equipo devuelto, "Nuevo" el del
        // equipo de reemplazo.
        condicionCargadorAnterior: condicionCargadorSchema.optional().nullable(),
        observacionesCargadorAnterior: z.string().optional().nullable(),
        condicionCargadorNuevo: condicionCargadorSchema.optional().nullable(),
        observacionesCargadorNuevo: z.string().optional().nullable(),
      })
    )
    .min(1, 'Elige al menos un equipo a cambiar'),
  // Coordinacion de cambio: permite coordinar la entrega del equipo nuevo
  // en el mismo formulario de creacion.
  fechaCambioCoordinada: z.string().optional().nullable(),
  medioCambio: z.enum(['presencial', 'chilexpress']).optional().nullable(),
  lugarCambio: z.string().max(200).optional().nullable(),
  otCambioChilexpress: z.string().max(100).optional().nullable(),
  ciudadCambio: z.string().max(200).optional().nullable(),
});

// Devolución por término fields
const devolucionTerminoFields = z.object({
  tipo: z.literal('offboarding'),
  ...baseRequestFields,
  // Igual que en cambio_equipo: el empleado ya existe de antes.
  employeeId: z.string().uuid('ID de empleado inválido'),
  // Opcional aca: la exige el servidor, salvo en la recuperacion de equipos
  // de alguien ya desvinculado, que usa la de la desvinculacion original
  // (SPEC 2.87).
  fechaDesvinculacion: z
    .string()
    .min(1, 'Fecha de desvinculación requerida')
    .transform((val) => {
      const date = new Date(val);
      if (isNaN(date.getTime())) throw new Error('Fecha de desvinculación inválida');
      return date;
    })
    .optional(),
  medioDevolucion: z.string().max(100).optional().nullable(),
  otChilexpress: z.string().max(100).optional().nullable(),
  ciudadDevolucion: z.string().max(200).optional().nullable(),
  // Coordinacion de devolucion: fecha/lugar en el mismo formulario de
  // creacion.
  fechaDevolucionCoordinada: z.string().optional().nullable(),
  lugarDevolucion: z.string().max(200).optional().nullable(),
  // Si los equipos ya estan en mano al crear el ticket, se pueden calificar
  // de una y el ticket salta equipo_recibido, cerrandose directo.
  devoluciones: z
    .array(
      z.object({
        assignmentId: z.string().uuid(),
        estadoDevolucion: z.enum(['ok', 'danado', 'no_devuelto']),
        observaciones: z.string().optional().nullable(),
        // Condicion del cargador: solo aplica si el activo es un notebook
        // con tieneCargador.
        condicionCargador: condicionCargadorSchema.optional().nullable(),
        observacionesCargador: z.string().optional().nullable(),
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
  // Solo onboarding puede traer el empleado "entero" en vez de un id; los
  // otros tipos siempre son sobre alguien que ya existe.
  .superRefine((data, ctx) => {
    if (data.tipo === 'onboarding' && !data.employeeId && !data.nuevoEmpleado) {
      ctx.addIssue({
        code: 'custom',
        path: ['employeeId'],
        message: 'Falta el empleado: manda un employeeId o los datos del nuevo empleado',
      });
    }
    // Un mismo equipo no se cambia dos veces, ni un reemplazo se entrega
    // por dos equipos distintos.
    if (data.tipo === 'cambio_equipo') {
      const viejos = data.cambios.map((c) => c.oldAssignmentId);
      const nuevos = data.cambios.map((c) => c.newAssetId);
      if (new Set(viejos).size !== viejos.length) {
        ctx.addIssue({ code: 'custom', path: ['cambios'], message: 'Un equipo aparece dos veces en el cambio' });
      }
      if (new Set(nuevos).size !== nuevos.length) {
        ctx.addIssue({ code: 'custom', path: ['cambios'], message: 'Un reemplazo aparece para dos equipos' });
      }
    }
  });

// Schema for cancelling a request (ver POST /api/solicitudes/[id]/cancelar).
// Solo permitido mientras la solicitud no ejecuto ningun efecto secundario
// (assignmentIds/kitReturnIds vacios) -- eso lo valida la ruta, no aca.
export const cancelWorkflowRequestSchema = z.object({
  motivo: z.string().trim().min(1, 'El motivo de cancelación es obligatorio').max(1000),
});

// ---------------------------------------------------------------------------
// datosAccion de una transicion (auditoria 27-sep-2026, A08 y B3). Antes era
// un Record<string, unknown> que la ruta leia con `as string[]`: un tipo
// inesperado terminaba en un 500 y una entrega "por Chilexpress" podia quedar
// sin OT. Aqui se tipa cada clave que usa la ruta y se exige la coordinacion
// completa segun el medio, con las mismas reglas que al crear la solicitud.
// ---------------------------------------------------------------------------
const textoOpcional = textoLibre;
const fechaTexto = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida')
  .optional()
  .nullable();
const medio = z.enum(['presencial', 'chilexpress']).optional().nullable();
const estadoDevolucionAccion = z.enum(['ok', 'danado', 'incompleto', 'no_devuelto']);

const datosAccionSchema = z
  .object({
    assetIds: z.array(z.string().uuid()).max(50).optional(),
    newAssetId: z.string().uuid().optional().nullable(),
    oldAssignmentId: z.string().uuid().optional().nullable(),
    estadoDevolucion: estadoDevolucionAccion.optional().nullable(),
    observacionesDevolucion: textoOpcional(1000),
    // La condicion del cargador la valida leerCondicionCargador en la ruta.
    condicionCargador: z.record(z.string(), z.unknown()).optional().nullable(),
    condicionCargadorAnterior: z.unknown().optional(),
    condicionCargadorNuevo: z.unknown().optional(),
    observacionesCargadorAnterior: textoOpcional(500),
    observacionesCargadorNuevo: textoOpcional(500),
    devoluciones: z
      .array(
        z.object({
          assignmentId: z.string().uuid(),
          estadoDevolucion: estadoDevolucionAccion,
          observaciones: textoOpcional(1000),
          condicionCargador: z.unknown().optional(),
          observacionesCargador: textoOpcional(500),
        })
      )
      .max(50)
      .optional(),
    devolucionesEpp: z
      .array(
        z.object({
          kitAssignmentId: z.string().uuid(),
          estadoDevolucion: z.enum(['ok', 'danado', 'no_devuelto']),
          observaciones: textoOpcional(1000),
        })
      )
      .max(100)
      .optional(),
    // Coordinacion de entrega (onboarding), cambio y devolucion.
    medioEntrega: medio,
    fechaEntregaCoordinada: fechaTexto,
    lugarEntrega: textoOpcional(200),
    otChilexpressEntrega: textoOpcional(100),
    ciudadEntrega: textoOpcional(100),
    medioCambio: medio,
    fechaCambioCoordinada: fechaTexto,
    lugarCambio: textoOpcional(200),
    otCambioChilexpress: textoOpcional(100),
    ciudadCambio: textoOpcional(100),
    medioDevolucion: medio,
    fechaDevolucionCoordinada: fechaTexto,
    lugarDevolucion: textoOpcional(200),
    otChilexpress: textoOpcional(100),
    ciudadDevolucion: textoOpcional(100),
  })
  .superRefine((d, ctx) => {
    // Si se indica el medio, se exigen sus datos: presencial -> lugar;
    // Chilexpress -> N° de OT y ciudad de destino.
    const reglas = [
      ['medioEntrega', 'lugarEntrega', 'otChilexpressEntrega', 'ciudadEntrega'],
      ['medioCambio', 'lugarCambio', 'otCambioChilexpress', 'ciudadCambio'],
      ['medioDevolucion', 'lugarDevolucion', 'otChilexpress', 'ciudadDevolucion'],
    ] as const;
    for (const [campoMedio, lugar, ot, ciudad] of reglas) {
      if (d[campoMedio] === 'presencial' && !d[lugar]) {
        ctx.addIssue({ code: 'custom', path: [lugar], message: 'Indica el lugar de la entrega presencial' });
      }
      if (d[campoMedio] === 'chilexpress') {
        if (!d[ot]) ctx.addIssue({ code: 'custom', path: [ot], message: 'Indica el N° de OT de Chilexpress' });
        if (!d[ciudad]) ctx.addIssue({ code: 'custom', path: [ciudad], message: 'Indica la ciudad de destino' });
      }
    }
  });

export type DatosAccionTransicion = z.infer<typeof datosAccionSchema>;

// Schema for transitioning state
export const transitionSchema = z.object({
  nuevoEstado: EstadoSolicitudEnum,
  comentario: z.string().trim().max(2000).optional().nullable(),
  datosAccion: datosAccionSchema.optional().nullable(),
});

// Schema for creating comments
export const createCommentSchema = z.object({
  mensaje: z.string().trim().min(1, 'El mensaje es requerido').max(2000),
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
  observaciones: textoLibre(),
  // Se puede agregar o corregir despues (tambien a las anteriores a 2.123).
  idTicket: idTicket.optional(),
});

// Schema for list filters
export const workflowFiltersSchema = z.object({
  search: z.string().optional(),
  tipo: TipoSolicitudEnum.optional(),
  // El dashboard filtra solo por si el ticket sigue abierto o ya se cerro;
  // los estados detallados se usan internamente para el flujo/Kanban.
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
