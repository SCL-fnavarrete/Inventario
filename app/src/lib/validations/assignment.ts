import { z } from "zod";
import { pngSignatureSchema, policyAcceptanceSchema } from './signature';

// Enums que coinciden con Prisma
export const TipoMovimientoEnum = z.enum(["ingreso", "cambio", "reemplazo", "temporal"]);
export const EstadoDevolucionEnum = z.enum(["ok", "danado", "incompleto"]);

// Schema para crear una asignación
export const createAssignmentSchema = z.object({
  assetId: z.string().uuid("ID de activo inválido"),
  employeeId: z.string().uuid("ID de empleado inválido"),
  fechaEntrega: z.string().transform((val) => new Date(val)),
  lugarEntrega: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  entregadoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  tipoMovimiento: TipoMovimientoEnum,
  motivo: z.string().optional().nullable(),
  firmaEmpleadoEntrega: pngSignatureSchema,
  aceptaPoliticaUso: policyAcceptanceSchema,
}).strict();

// Schema para asignación múltiple (varios activos a un empleado)
export const createMultipleAssignmentsSchema = z.object({
  employeeId: z.string().uuid("ID de empleado inválido"),
  assetIds: z.array(z.string().uuid()).min(1, "Debe seleccionar al menos un activo"),
  fechaEntrega: z.string().transform((val) => new Date(val)),
  lugarEntrega: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  entregadoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  tipoMovimiento: TipoMovimientoEnum,
  motivo: z.string().optional().nullable(),
  firmaEmpleadoEntrega: pngSignatureSchema,
  aceptaPoliticaUso: policyAcceptanceSchema,
}).strict();

// Schema para registrar devolución
export const returnAssignmentSchema = z.object({
  fechaDevolucion: z.string().transform((val) => new Date(val)),
  recibidoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  estadoDevolucion: EstadoDevolucionEnum,
  observacionesDevolucion: z.string().optional().nullable(),
  firmaEmpleadoDevolucion: pngSignatureSchema,
  aceptaPoliticaUso: policyAcceptanceSchema,
}).strict();

/**
 * A single official act for several assignments; client timestamps are not part
 * of this shape.
 *
 * `employeeId` is required: the act belongs to one employee, and its signature
 * is that person's. While it was optional, `executeReturn` fell back to
 * `assignment.employeeId` and compared the assignment against itself, so a
 * batch mixing two employees closed every return with a single signature.
 */
export const returnMultipleAssignmentsSchema = z.object({
  assignmentIds: z.array(z.string().uuid('ID de asignación inválido')).min(1).max(100),
  employeeId: z.string().uuid('ID de empleado inválido'),
  fechaDevolucion: z.string().transform((val) => new Date(val)),
  recibidoPor: z.string().trim().min(1, 'Recibido por es requerido').max(100),
  estadoDevolucion: EstadoDevolucionEnum,
  observacionesDevolucion: z.string().optional().nullable(),
  firmaEmpleadoDevolucion: pngSignatureSchema,
  aceptaPoliticaUso: policyAcceptanceSchema,
}).strict();

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
export type ReturnMultipleAssignmentsInput = z.infer<typeof returnMultipleAssignmentsSchema>;
export type AssignmentFilters = z.infer<typeof assignmentFiltersSchema>;
