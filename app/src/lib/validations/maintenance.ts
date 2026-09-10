import { z } from "zod";

// El tipo de mantencion (Preventiva, Correctiva, etc.) ya no es un enum
// fijo (9-sep-2026): ahora es una fila de MaintenanceType, referenciada
// por id. Ver prisma/schema.prisma y src/app/api/mantenciones/tipos.
const tipoIdSchema = z.string().uuid("Tipo de mantención inválido");

// Enums que coinciden con Prisma
export const EstadoMantencionEnum = z.enum([
  "pendiente",
  "en_proceso",
  "completada",
  "cancelada",
]);

// Campo de costo reutilizable: acepta 0 o positivo, opcional y nullable.
// Usado por las tres schemas de mantención para que la regla no se desincronice entre ellas.
const costoSchema = z.number().nonnegative("El costo debe ser 0 o positivo").optional().nullable();



// Schema para crear una mantención
export const createMaintenanceSchema = z.object({
  assetId: z.string().uuid("ID de activo inválido"),
  tipoId: tipoIdSchema,
  descripcion: z.string().min(1, "La descripción es requerida").max(1000, "Máximo 1000 caracteres"),
  // Obligatoria: una mantención no puede quedar "en proceso" (boton
  // Iniciar) sin haber tenido nunca una fecha programada. El formulario ya
  // la exige, esto es la misma regla del lado del servidor.
  fechaProgramada: z.string().min(1, "La fecha programada es requerida").transform((val, ctx) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fecha programada inválida" });
      return z.NEVER;
    }
    return date;
  }),
  proximaMantencion: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  realizadoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  costo: costoSchema,
  proveedorExterno: z.string().max(200, "Máximo 200 caracteres").optional().nullable(),
});

// Schema para actualizar una mantención
export const updateMaintenanceSchema = z.object({
  tipoId: tipoIdSchema.optional(),
  descripcion: z.string().min(1, "La descripción es requerida").max(1000, "Máximo 1000 caracteres").optional(),
  fechaProgramada: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  fechaRealizada: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  proximaMantencion: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  realizadoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  costo: costoSchema,
  proveedorExterno: z.string().max(200, "Máximo 200 caracteres").optional().nullable(),
  estado: EstadoMantencionEnum.optional(),
  resultado: z.string().max(1000, "Máximo 1000 caracteres").optional().nullable(),
});

// Schema para completar una mantención
export const completeMaintenanceSchema = z.object({
  fechaRealizada: z.string().transform((val) => new Date(val)),
  realizadoPor: z.string().min(1, "Requerido").max(100, "Máximo 100 caracteres"),
  resultado: z.string().min(1, "El resultado es requerido").max(1000, "Máximo 1000 caracteres"),
  costo: costoSchema,
  proximaMantencion: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
});

// Schema para filtros de búsqueda
export const maintenanceFiltersSchema = z.object({
  search: z.string().optional(),
  assetId: z.string().uuid().optional(),
  tipoId: z.string().uuid().optional(),
  estado: EstadoMantencionEnum.optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  pendientes: z.coerce.boolean().optional(),
  vencidas: z.coerce.boolean().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.enum(["fechaProgramada", "fechaRealizada", "createdAt", "tipoId", "estado"]).default("fechaProgramada"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Tipos inferidos
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;
export type CompleteMaintenanceInput = z.infer<typeof completeMaintenanceSchema>;
export type MaintenanceFilters = z.infer<typeof maintenanceFiltersSchema>;
