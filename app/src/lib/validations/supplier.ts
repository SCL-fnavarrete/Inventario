import { z } from "zod";

// Schema para crear un proveedor
export const createSupplierSchema = z.object({
  rutEmpresa: z
    .string()
    .max(15, "Máximo 15 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  razonSocial: z
    .string()
    .min(1, "La razón social es requerida")
    .max(200, "Máximo 200 caracteres"),
  nombreContacto: z
    .string()
    .max(100, "Máximo 100 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  email: z
    .string()
    .email("Email inválido")
    .max(150, "Máximo 150 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  telefono: z
    .string()
    .max(20, "Máximo 20 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  direccion: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val || null),
});

// Schema para actualizar un proveedor
export const updateSupplierSchema = z.object({
  rutEmpresa: z
    .string()
    .max(15, "Máximo 15 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  razonSocial: z
    .string()
    .min(1, "La razón social es requerida")
    .max(200, "Máximo 200 caracteres")
    .optional(),
  nombreContacto: z
    .string()
    .max(100, "Máximo 100 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  email: z
    .string()
    .email("Email inválido")
    .max(150, "Máximo 150 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  telefono: z
    .string()
    .max(20, "Máximo 20 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  direccion: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val || null),
});

// Schema para filtros de búsqueda de proveedores
export const supplierFiltersSchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.enum(["razonSocial", "createdAt", "email"]).default("razonSocial"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Tipos inferidos
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type SupplierFilters = z.infer<typeof supplierFiltersSchema>;
