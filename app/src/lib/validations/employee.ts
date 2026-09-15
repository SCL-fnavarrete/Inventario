import { z } from "zod";
import { rutSchema, rutOptionalSchema } from "./rut";

// Enums que coinciden con Prisma
export const TipoContratoEnum = z.enum(["contrato", "boleta"]);

/**
 * Fecha opcional que distingue tres casos:
 *   - ausente (undefined): el campo no viene en la peticion -> no se toca
 *   - vacio (null o ""):   se pide explicitamente borrarlo   -> se guarda null
 *   - texto valido:        se convierte a Date
 *
 * Sin esta distincion, una actualizacion parcial borraba las fechas que ni
 * siquiera mencionaba: el schema convertia el "ausente" en null y la ruta,
 * que pregunta por !== undefined, lo escribia en la base.
 */
const fechaOpcional = z
  .union([z.string(), z.null()])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    const fecha = new Date(val);
    return isNaN(fecha.getTime()) ? null : fecha;
  });

export const EstadoEmpleadoEnum = z.enum(["activo", "desvinculado", "licencia"]);

// Schema para crear un empleado
export const createEmployeeSchema = z.object({
  rut: rutOptionalSchema,
  nombres: z.string().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres"),
  apellidoPaterno: z.string().min(1, "El apellido paterno es requerido").max(100, "Máximo 100 caracteres"),
  apellidoMaterno: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  // 15-sep-2026 (SPEC 2.39): el obligatorio es el correo de EMPRESA, no el
  // personal. Es el que siempre existe en las planillas de TI y con el que
  // se identifica a la persona; el particular muchas veces nadie lo registro.
  correoPersonal: z.string().email("Email inválido").max(150, "Máximo 150 caracteres").optional().nullable(),
  correoEmpresa: z.string().email("Email inválido").max(150, "Máximo 150 caracteres"),
  cargo: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  jefatura: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  supervisor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  ubicacion: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  division: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  area: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  subArea: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  direccionParticular: z.string().max(300, "Máximo 300 caracteres").optional().nullable(),
  listasDistribucion: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
  // Opcional desde el 15-sep-2026 (SPEC 2.39): las planillas de origen no
  // traen este dato y forzarlo obligaba a inventarlo. Lo completan los
  // tecnicos cuando lo saben.
  tipoContrato: TipoContratoEnum.optional().nullable(),
  fechaIngreso: fechaOpcional,
  fechaTermino: fechaOpcional,
  estado: EstadoEmpleadoEnum.default("activo"),
  telefonoContacto: z.string().max(20, "Máximo 20 caracteres").optional().nullable(),
  fechaEntregaKit: fechaOpcional,
  fechaEntregaEpp: fechaOpcional,
  proximaMantencionEpp: fechaOpcional,
});

// Schema para actualizar un empleado
export const updateEmployeeSchema = z.object({
  rut: rutOptionalSchema,
  nombres: z.string().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres").optional(),
  apellidoPaterno: z.string().min(1, "El apellido paterno es requerido").max(100, "Máximo 100 caracteres").optional(),
  apellidoMaterno: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  correoPersonal: z.string().email("Email inválido").max(150, "Máximo 150 caracteres").optional().nullable(),
  // En la edicion sigue siendo `.optional()` (como todo el resto de este
  // schema, que permite actualizaciones parciales), pero ya no acepta null:
  // un empleado no puede quedarse sin correo de empresa.
  correoEmpresa: z.string().email("Email inválido").max(150, "Máximo 150 caracteres").optional(),
  cargo: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  jefatura: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  supervisor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  ubicacion: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  division: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  area: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  subArea: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  direccionParticular: z.string().max(300, "Máximo 300 caracteres").optional().nullable(),
  listasDistribucion: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
  tipoContrato: TipoContratoEnum.optional().nullable(),
  fechaIngreso: fechaOpcional,
  fechaTermino: fechaOpcional,
  estado: EstadoEmpleadoEnum.optional(),
  telefonoContacto: z.string().max(20, "Máximo 20 caracteres").optional().nullable(),
  fechaEntregaKit: fechaOpcional,
  fechaEntregaEpp: fechaOpcional,
  proximaMantencionEpp: fechaOpcional,
  // Reasignar la sede de un empleado ya creado (ej. se traslada de
  // Concepcion a Santiago). Solo admin puede enviarlo -- la ruta ignora
  // este campo si lo envia un tecnico. Ya no se acepta null: el select del
  // formulario no ofrece "Sin sede" (ver SPEC 2.9) -- un empleado siempre
  // debe quedar con una sede real asignada, nunca transversal.
  sedeId: z.string().uuid("Sede inválida").optional(),
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
  sortBy: z.enum(["nombres", "rut", "correoPersonal", "correoEmpresa", "cargo", "fechaIngreso", "createdAt"]).default("nombres"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Schema para importación desde Excel
export const importEmployeeSchema = z.object({
  rut: rutSchema,
  nombres: z.string().min(1, "El nombre es requerido"),
  apellidoPaterno: z.string().min(1, "El apellido paterno es requerido"),
  apellidoMaterno: z.string().optional().nullable(),
  // 15-sep-2026 (SPEC 2.39): la planilla trae la cuenta corporativa, asi que
  // el correo obligatorio de la importacion es el de empresa. El particular
  // queda opcional, igual que en el alta manual.
  correoEmpresa: z.string().email("Email inválido"),
  correoPersonal: z.string().email("Email inválido").optional().nullable(),
  cargo: z.string().optional().nullable(),
  jefatura: z.string().optional().nullable(),
  supervisor: z.string().optional().nullable(),
  ubicacion: z.string().optional().nullable(),
  // Si la planilla no trae el tipo de contrato, se deja sin dato en vez de
  // asumir "contrato" -- ver SPEC 2.39.
  tipoContrato: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const lower = val.toLowerCase();
    if (lower === "contrato" || lower === "boleta") {
      return lower as "contrato" | "boleta";
    }
    // Compatibilidad con valores antiguos (planta/proyecto -> contrato,
    // externo/honorarios -> boleta) y con texto libre de planillas.
    if (lower.includes("boleta") || lower.includes("externo") || lower.includes("honorario")) {
      return "boleta" as const;
    }
    return "contrato" as const; // planta, proyecto, indefinido, etc.
  }),
  fechaIngreso: z.string().optional().nullable().transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  }),
  telefonoContacto: z.string().optional().nullable(),
});

// Schema para sincronizacion desde Microsoft Entra ID
export const microsoftSyncEmployeeSchema = z.object({
  microsoftId: z.string().min(1),
  nombres: z.string().min(1).max(100),
  apellidoPaterno: z.string().min(1).max(100),
  apellidoMaterno: z.string().max(100).optional().nullable(),
  correoEmpresa: z.string().email().max(150),
  cargo: z.string().max(100).optional().nullable(),
  jefatura: z.string().max(100).optional().nullable(),
  supervisor: z.string().max(100).optional().nullable(),
  ubicacion: z.string().max(100).optional().nullable(),
  telefonoContacto: z.string().max(20).optional().nullable(),
});

// Tipos inferidos
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeFilters = z.infer<typeof employeeFiltersSchema>;
export type ImportEmployeeInput = z.infer<typeof importEmployeeSchema>;
export type MicrosoftSyncEmployeeInput = z.infer<typeof microsoftSyncEmployeeSchema>;
