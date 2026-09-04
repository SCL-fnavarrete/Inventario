import { z } from "zod";

// Enums que coinciden con Prisma
export const TipoMovimientoEnum = z.enum(["ingreso", "cambio", "reemplazo", "temporal"]);
export const EstadoDevolucionEnum = z.enum(["ok", "danado", "incompleto"]);

/**
 * Fecha obligatoria que llega como texto desde un formulario o desde la API.
 *
 * Antes era `z.string().transform((val) => new Date(val))` sin comprobar nada:
 * cualquier texto producia un Invalid Date que recien reventaba al llegar a la
 * base, con un error que no decia nada util, y una fecha del año 2050 entraba
 * sin objeciones. Un equipo no se puede entregar ni devolver en el futuro.
 */
const fechaObligatoria = z
  .string()
  .min(1, "La fecha es requerida")
  .transform((val) => new Date(val))
  .refine((fecha) => !isNaN(fecha.getTime()), "Fecha invalida")
  // Se tolera un dia de margen porque el navegador y el servidor pueden estar
  // en husos distintos y una entrega de hoy no debe rechazarse por eso.
  .refine(
    (fecha) => fecha.getTime() <= Date.now() + 24 * 60 * 60 * 1000,
    "La fecha no puede ser futura"
  );

// Schema para crear una asignación
export const createAssignmentSchema = z.object({
  assetId: z.string().uuid("ID de activo inválido"),
  employeeId: z.string().uuid("ID de empleado inválido"),
  fechaEntrega: fechaObligatoria,
  lugarEntrega: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  entregadoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  tipoMovimiento: TipoMovimientoEnum,
  motivo: z.string().optional().nullable(),
});

// Schema para asignación múltiple (varios activos a un empleado)
export const createMultipleAssignmentsSchema = z.object({
  employeeId: z.string().uuid("ID de empleado inválido"),
  assetIds: z.array(z.string().uuid()).min(1, "Debe seleccionar al menos un activo"),
  fechaEntrega: fechaObligatoria,
  lugarEntrega: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  entregadoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  tipoMovimiento: TipoMovimientoEnum,
  motivo: z.string().optional().nullable(),
});

// Schema para registrar devolución
export const returnAssignmentSchema = z.object({
  fechaDevolucion: fechaObligatoria,
  recibidoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  estadoDevolucion: EstadoDevolucionEnum,
  observacionesDevolucion: z.string().optional().nullable(),
});

// Schema para filtros de búsqueda
export const assignmentFiltersSchema = z.object({
  search: z.string().optional(),
  employeeId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  activo: z.enum(["true", "false"]).optional().transform((val) => val === "true"),
  tipoMovimiento: TipoMovimientoEnum.optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.enum(["fechaEntrega", "fechaDevolucion", "createdAt"]).default("fechaEntrega"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Tipos inferidos
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type CreateMultipleAssignmentsInput = z.infer<typeof createMultipleAssignmentsSchema>;
export type ReturnAssignmentInput = z.infer<typeof returnAssignmentSchema>;
export type AssignmentFilters = z.infer<typeof assignmentFiltersSchema>;
