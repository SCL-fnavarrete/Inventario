import { z } from "zod";
import { motivoBajaEnum, resultadoMantencionEnum } from "./assetTransition";

// El tipo de mantencion es una fila de MaintenanceType, referenciada por id
// (ver prisma/schema.prisma y src/app/api/mantenciones/tipos).
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



/**
 * Fecha obligatoria: vacia o mal escrita da un error del campo, en vez de
 * guardar una fecha invalida (antes completar con la fecha vacia daba un
 * error generico del servidor).
 */
function fechaRequerida(mensaje: string) {
  return z
    .string()
    .min(1, mensaje)
    .transform((val, ctx) => {
      const date = new Date(val);
      if (isNaN(date.getTime())) {
        ctx.addIssue({ code: "custom", message: "Fecha inválida" });
        return z.NEVER;
      }
      return date;
    });
}

/** Fecha opcional: vacia o mal escrita queda en null. */
const fechaOpcional = z
  .string()
  .optional()
  .nullable()
  .transform((val) => {
    if (!val) return null;
    const date = new Date(val);
    return isNaN(date.getTime()) ? null : date;
  });

// Fecha programada obligatoria, compartida por programar y editar.
const fechaProgramadaSchema = fechaRequerida("La fecha programada es requerida");

// Hora en Chile "HH:MM" (SPEC 2.98), opcional. Vacia se guarda como null;
// si no viene queda undefined, y al editar no se toca la guardada.
const horaProgramadaSchema = z
  .string()
  .regex(/^(([01]\d|2[0-3]):[0-5]\d)?$/, "Hora inválida (usa HH:MM)")
  .nullable()
  .optional()
  .transform((val) => (val === "" ? null : val));

const descripcionSchema = z
  .string()
  .trim()
  .min(1, "La descripción es requerida")
  .max(1000, "Máximo 1000 caracteres");

// Schema para crear una mantención
export const createMaintenanceSchema = z.object({
  assetId: z.string().uuid("ID de activo inválido"),
  tipoId: tipoIdSchema,
  descripcion: descripcionSchema,
  // Obligatoria: una mantención no puede iniciarse sin fecha programada.
  fechaProgramada: fechaProgramadaSchema,
  horaProgramada: horaProgramadaSchema,
  proximaMantencion: fechaOpcional,
  realizadoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  costo: costoSchema,
  proveedorExterno: z.string().max(200, "Máximo 200 caracteres").optional().nullable(),
});

// Schema para actualizar una mantención (SPEC 2.96). Dos usos, no a la vez:
//  - cambiar el estado: "en_proceso" (Iniciar) o "cancelada". Completar
//    tiene su propia ruta (/completar), por eso "completada" no se acepta.
//  - editar una mantención pendiente: tipo, fecha, descripción, técnico...
// Los campos que no vienen no se tocan (antes un campo ausente se guardaba
// como null, y al pulsar Iniciar se borraba la fecha programada).
export const updateMaintenanceSchema = z.object({
  tipoId: tipoIdSchema.optional(),
  descripcion: descripcionSchema.optional(),
  fechaProgramada: fechaProgramadaSchema.optional(),
  horaProgramada: horaProgramadaSchema,
  realizadoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  costo: costoSchema,
  proveedorExterno: z.string().max(200, "Máximo 200 caracteres").optional().nullable(),
  estado: z.enum(["en_proceso", "cancelada"]).optional(),
  // Motivo al cancelar (opcional).
  resultado: z.string().max(1000, "Máximo 1000 caracteres").optional().nullable(),
});

// Schema para completar una mantención: "resultado" es descripción libre,
// "resultadoTipo" es el valor estructurado (reparado / no_reparable /
// pendiente_repuestos) que determina si el activo se da de baja.
export const completeMaintenanceSchema = z
  .object({
    fechaRealizada: fechaRequerida("La fecha es requerida"),
    realizadoPor: z.string().min(1, "Requerido").max(100, "Máximo 100 caracteres"),
    resultado: z.string().min(1, "El resultado es requerido").max(1000, "Máximo 1000 caracteres"),
    resultadoTipo: resultadoMantencionEnum,
    motivoBaja: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
    costo: costoSchema,
    proximaMantencion: fechaOpcional,
  })
  .refine(
    (data) => data.resultadoTipo !== "no_reparable" || (data.motivoBaja && data.motivoBaja.length > 0),
    {
      message: 'Escribe el motivo de la baja cuando el resultado es "Sin reparación"',
      path: ["motivoBaja"],
    }
  );

// Dar de baja un equipo por mantencion (SPEC 2.88): cierra su mantencion
// abierta, o registra una ya cerrada, como "Sin reparación".
export const bajaPorMantencionSchema = z
  .object({
    assetId: z.string().uuid("Equipo inválido"),
    // Se usa solo si el equipo no tiene una mantencion abierta.
    tipoId: tipoIdSchema,
    motivo: motivoBajaEnum,
    motivoDetalle: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
    observaciones: z.string().max(1000, "Máximo 1000 caracteres").optional().nullable(),
    fechaRealizada: fechaRequerida("Fecha requerida"),
    realizadoPor: z.string().min(1, "Requerido").max(100, "Máximo 100 caracteres"),
  })
  .refine((d) => d.motivo !== "otro" || !!d.motivoDetalle?.trim(), {
    message: 'Describe el motivo cuando eliges "Otro"',
    path: ["motivoDetalle"],
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
  // Filtro de periodo, en dias. 0 es el sentinel de "sin limite" (filtro
  // "Todas"), por eso min(0) en vez de min(1).
  dias: z.coerce.number().min(0).optional(),
  diasCompletadas: z.coerce.number().min(0).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  // Sin sortBy el listado va en orden de agenda (SPEC 2.98): en proceso,
  // proximas, vencidas y al final las cerradas.
  sortBy: z.enum(["fechaProgramada", "fechaRealizada", "createdAt", "tipoId", "estado"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

// Tipos inferidos
export type CreateMaintenanceInput = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceInput = z.infer<typeof updateMaintenanceSchema>;
export type CompleteMaintenanceInput = z.infer<typeof completeMaintenanceSchema>;
export type BajaPorMantencionInput = z.input<typeof bajaPorMantencionSchema>;
export type MaintenanceFilters = z.infer<typeof maintenanceFiltersSchema>;
