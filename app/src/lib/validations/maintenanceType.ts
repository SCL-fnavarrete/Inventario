import { z } from "zod";

// Tipos de mantencion (9-sep-2026): catalogo dinamico, ver nota en
// prisma/schema.prisma (model MaintenanceType) y permissions.ts
// (recurso "tiposMantencion") para el contexto completo del cambio.

export const createMaintenanceTypeSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres"),
  descripcion: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
});

export const updateMaintenanceTypeSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres").optional(),
  descripcion: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
  activo: z.boolean().optional(),
});

export type CreateMaintenanceTypeInput = z.infer<typeof createMaintenanceTypeSchema>;
export type UpdateMaintenanceTypeInput = z.infer<typeof updateMaintenanceTypeSchema>;
