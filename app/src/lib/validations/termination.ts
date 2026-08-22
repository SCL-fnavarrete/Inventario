import { z } from "zod";
import { pngSignatureSchema, policyAcceptanceSchema } from './signature';

// Enums que coinciden con Prisma
export const EstadoDevolucionTipoEnum = z.enum(["ok", "danado", "no_aplica", "pendiente"]);

// Schema para crear una desvinculación
export const createTerminationSchema = z.object({
  employeeId: z.string().uuid("ID de empleado inválido"),
  fechaDesvinculacion: z.string().transform((val) => new Date(val)),
  fechaDevolucionEquipos: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  recibidoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  lugarDevolucion: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  observaciones: z.string().optional().nullable(),
});

// Schema para actualizar estados de devolución
export const updateTerminationSchema = z.object({
  fechaDevolucionEquipos: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  estadoNotebook: EstadoDevolucionTipoEnum.optional(),
  estadoCelular: EstadoDevolucionTipoEnum.optional(),
  estadoMonitor: EstadoDevolucionTipoEnum.optional(),
  estadoKit: EstadoDevolucionTipoEnum.optional(),
  recibidoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  lugarDevolucion: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  requiereDescuento: z.boolean().optional(),
  montoDescuento: z.number().positive("El monto debe ser positivo").optional().nullable(),
  motivoDescuento: z.string().optional().nullable(),
  notificadoRrhh: z.boolean().optional(),
  observaciones: z.string().optional().nullable(),
});

// Schema para registrar devolución de equipos
export const registerReturnSchema = z.object({
  fechaDevolucionEquipos: z.string().transform((val) => new Date(val)),
  estadoNotebook: EstadoDevolucionTipoEnum,
  estadoCelular: EstadoDevolucionTipoEnum,
  estadoMonitor: EstadoDevolucionTipoEnum,
  estadoKit: EstadoDevolucionTipoEnum,
  recibidoPor: z.string().trim().min(1, "Requerido").max(100, "Máximo 100 caracteres"),
  lugarDevolucion: z.string().trim().min(1, "Requerido").max(100, "Máximo 100 caracteres"),
  requiereDescuento: z.boolean().default(false),
  montoDescuento: z.number().positive("El monto debe ser positivo").optional().nullable(),
  motivoDescuento: z.string().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  firmaEmpleadoDevolucion: pngSignatureSchema,
  aceptaPoliticaUso: policyAcceptanceSchema,
}).strict();

// Schema para filtros de búsqueda
export const terminationFiltersSchema = z.object({
  search: z.string().optional(),
  pendientes: z.coerce.boolean().optional(),
  notificadoRrhh: z.coerce.boolean().optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.enum(["fechaDesvinculacion", "createdAt"]).default("fechaDesvinculacion"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Tipos inferidos
export type CreateTerminationInput = z.infer<typeof createTerminationSchema>;
export type UpdateTerminationInput = z.infer<typeof updateTerminationSchema>;
export type RegisterReturnInput = z.infer<typeof registerReturnSchema>;
export type TerminationFilters = z.infer<typeof terminationFiltersSchema>;
