import { z } from "zod";
import { rutOptionalSchema } from "@/shared/validaciones/rut";
import { MENSAJE_TERMINO_ANTES_DE_INGRESO, terminaAntesDeEmpezar } from "@/shared/validaciones/ordenFechas";

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
  .transform((val, ctx) => {
    if (val === undefined) return undefined;
    if (val === null || val === "") return null;
    const fecha = new Date(val);
    // Una fecha invalida es un error, no un "borrar": antes se guardaba
    // null y se perdia la fecha que habia (auditoria 28-sep-2026, 7.A-2).
    if (isNaN(fecha.getTime())) {
      ctx.addIssue({ code: "custom", message: "Fecha inválida" });
      return z.NEVER;
    }
    return fecha;
  });

/** Telefono opcional: solo numeros, espacios, +, - y parentesis (7.B). */
const telefono = z
  .string()
  .trim()
  .max(20, "Máximo 20 caracteres")
  .regex(/^[+\d\s()-]*$/, "Solo números, espacios, +, - o paréntesis")
  .optional()
  .nullable();

export const EstadoEmpleadoEnum = z.enum(["activo", "desvinculado", "licencia"]);

// Schema para crear un empleado
export const createEmployeeSchema = z.object({
  rut: rutOptionalSchema,
  nombres: z.string().trim().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres"),
  apellidoPaterno: z.string().trim().min(1, "El apellido paterno es requerido").max(100, "Máximo 100 caracteres"),
  apellidoMaterno: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  // El obligatorio es el correo personal: es el unico que se exige y con
  // el que se identifica a la persona. El de empresa quedo opcional (se
  // conserva si viene del Excel, pero ya no es requisito).
  correoPersonal: z.string().trim().email("Email inválido").max(150, "Máximo 150 caracteres"),
  correoEmpresa: z.string().email("Email inválido").max(150, "Máximo 150 caracteres").optional().nullable(),
  cargo: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  jefatura: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  supervisor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  ubicacion: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  division: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  area: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  subArea: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  direccionParticular: z.string().max(300, "Máximo 300 caracteres").optional().nullable(),
  listasDistribucion: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
  // Opcional: las planillas de origen no siempre traen este dato. Lo
  // completan los tecnicos cuando lo saben.
  tipoContrato: TipoContratoEnum.optional().nullable(),
  fechaIngreso: fechaOpcional,
  fechaTermino: fechaOpcional,
  estado: EstadoEmpleadoEnum.default("activo"),
  telefonoContacto: telefono,
  fechaEntregaKit: fechaOpcional,
  fechaEntregaEpp: fechaOpcional,
  proximaMantencionEpp: fechaOpcional,
}).superRefine((datos, ctx) => {
  if (terminaAntesDeEmpezar(datos.fechaIngreso, datos.fechaTermino)) {
    ctx.addIssue({
      code: "custom",
      path: ["fechaTermino"],
      message: MENSAJE_TERMINO_ANTES_DE_INGRESO,
    });
  }
});

// Schema para actualizar un empleado. El orden ingreso/termino lo revisa la
// ruta, que conoce la fecha ya guardada si solo llega una de las dos.
export const updateEmployeeSchema = z.object({
  rut: rutOptionalSchema,
  nombres: z.string().trim().min(1, "El nombre es requerido").max(100, "Máximo 100 caracteres").optional(),
  apellidoPaterno: z.string().trim().min(1, "El apellido paterno es requerido").max(100, "Máximo 100 caracteres").optional(),
  apellidoMaterno: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  // Sigue siendo `.optional()` porque este schema permite actualizaciones
  // parciales (el campo puede no venir en la peticion), pero ya no acepta
  // null: un empleado no puede quedarse sin correo personal.
  correoPersonal: z.string().trim().email("Email inválido").max(150, "Máximo 150 caracteres").optional(),
  correoEmpresa: z.string().email("Email inválido").max(150, "Máximo 150 caracteres").optional().nullable(),
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
  telefonoContacto: telefono,
  fechaEntregaKit: fechaOpcional,
  fechaEntregaEpp: fechaOpcional,
  proximaMantencionEpp: fechaOpcional,
  // Reasignar la sede de un empleado ya creado. Solo admin puede enviarlo;
  // la ruta ignora este campo si lo envia un tecnico. No acepta null: un
  // empleado siempre debe quedar con una sede real asignada.
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

// Tipos inferidos
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type EmployeeFilters = z.infer<typeof employeeFiltersSchema>;

// Listas de opciones de los datos de una persona (SPEC 2.142). Cada una apunta
// al campo de la persona donde se guarda el nombre elegido.
export const TIPOS_OPCION_PERSONA = {
  supervisor: { campo: "supervisor", etiqueta: "Supervisor", titulo: "Supervisores" },
  division: { campo: "division", etiqueta: "División", titulo: "Divisiones" },
  area: { campo: "area", etiqueta: "Área", titulo: "Áreas" },
  sub_area: { campo: "subArea", etiqueta: "Sub-área", titulo: "Sub-áreas" },
  lista_distribucion: { campo: "listasDistribucion", etiqueta: "Lista de distribución", titulo: "Listas de distribución" },
} as const;
export type TipoOpcionPersona = keyof typeof TIPOS_OPCION_PERSONA;
export const tipoOpcionPersonaSchema = z.enum(Object.keys(TIPOS_OPCION_PERSONA) as [TipoOpcionPersona, ...TipoOpcionPersona[]]);

/** Los nombres de una lista de distribucion: separados por coma. */
export const nombresDeLista = (texto: string | null | undefined) =>
  (texto ?? "").split(",").map((n) => n.trim()).filter(Boolean);

// Una lista de distribucion se guarda separada por coma: el nombre no puede llevar una.
export const opcionPersonaSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Escribe el nombre")
    .max(100, "Máximo 100 caracteres")
    .refine((n) => !n.includes(","), "No puede llevar comas"),
});
