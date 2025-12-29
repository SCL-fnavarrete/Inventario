import { z } from "zod";
import { rutSchema, rutOptionalSchema } from "./rut";

// Enums que coinciden con Prisma
export const TipoContratoEnum = z.enum(["planta", "proyecto", "externo"]);
export const EstadoEmpleadoEnum = z.enum(["activo", "desvinculado", "licencia"]);

// Schema para crear un empleado
export const createEmployeeSchema = z.object({
  rut: rutSchema,
  nombres: z.string().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres"),
  apellidoPaterno: z.string().min(1, "El apellido paterno es requerido").max(100, "Máximo 100 caracteres"),
  apellidoMaterno: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  correo: z.string().email("Email inválido").max(150, "Máximo 150 caracteres"),
  cargo: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  jefatura: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  supervisor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  ubicacion: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  tipoContrato: TipoContratoEnum,
  fechaIngreso: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  fechaTermino: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  estado: EstadoEmpleadoEnum.default("activo"),
  telefonoContacto: z.string().max(20, "Máximo 20 caracteres").optional().nullable(),
  fechaEntregaKit: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  fechaEntregaEpp: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  proximaMantencionEpp: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
});

// Schema para actualizar un empleado
export const updateEmployeeSchema = z.object({
  rut: rutSchema.optional(),
  nombres: z.string().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres").optional(),
  apellidoPaterno: z.string().min(1, "El apellido paterno es requerido").max(100, "Máximo 100 caracteres").optional(),
  apellidoMaterno: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  correo: z.string().email("Email inválido").max(150, "Máximo 150 caracteres").optional(),
  cargo: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  jefatura: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  supervisor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  ubicacion: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  tipoContrato: TipoContratoEnum.optional(),
  fechaIngreso: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  fechaTermino: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  estado: EstadoEmpleadoEnum.optional(),
  telefonoContacto: z.string().max(20, "Máximo 20 caracteres").optional().nullable(),
  fechaEntregaKit: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  fechaEntregaEpp: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  proximaMantencionEpp: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
});

// Schema para filtros de búsqueda
export const employeeFiltersSchema = z.object({
  search: z.string().optional(),
  estado: EstadoEmpleadoEnum.optional(),
  tipoContrato: TipoContratoEnum.optional(),
  ubicacion: z.string().optional(),
  jefatura: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.enum(["nombres", "rut", "correo", "cargo", "fechaIngreso", "createdAt"]).default("nombres"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Schema para importación desde Excel
export const importEmployeeSchema = z.object({
  rut: rutSchema,
  nombres: z.string().min(1, "El nombre es requerido"),
  apellidoPaterno: z.string().min(1, "El apellido paterno es requerido"),
  apellidoMaterno: z.string().optional().nullable(),
  correo: z.string().email("Email inválido"),
  cargo: z.string().optional().nullable(),
  jefatura: z.string().optional().nullable(),
  supervisor: z.string().optional().nullable(),
  ubicacion: z.string().optional().nullable(),
  tipoContrato: z.string().transform((val) => {
    const lower = val.toLowerCase();
    if (lower === "planta" || lower === "proyecto" || lower === "externo") {
      return lower as "planta" | "proyecto" | "externo";
    }
    return "proyecto" as const; // Default
  }),
  fechaIngreso: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  telefonoContacto: z.string().optional().nullable(),
});

// Tipos inferidos
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeFilters = z.infer<typeof employeeFiltersSchema>;
export type ImportEmployeeInput = z.infer<typeof importEmployeeSchema>;
