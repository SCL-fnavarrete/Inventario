import { z } from "zod";

// Estados de activos validos
export const estadoActivoEnum = z.enum([
  "disponible",
  "asignado",
  "en_mantencion",
  "reutilizable",
  "baja",
  "vendido",
]);

// Condiciones de activos validas
export const condicionActivoEnum = z.enum(["nuevo", "usado", "danado"]);

// Schema base para activos
export const assetSchema = z.object({
  categoriaId: z.string().uuid("ID de categoria invalido"),

  // Identificacion
  numeroSerie: z.string().max(50, "Maximo 50 caracteres").optional().nullable(),
  imei: z.string().max(20, "Maximo 20 caracteres").optional().nullable(),
  numeroActivoInterno: z.string().max(50, "Maximo 50 caracteres").optional().nullable(),

  // Datos generales
  marca: z.string().min(1, "La marca es requerida").max(50, "Maximo 50 caracteres"),
  modelo: z.string().min(1, "El modelo es requerido").max(100, "Maximo 100 caracteres"),

  // Specs Notebook/PC
  procesador: z.string().max(100, "Maximo 100 caracteres").optional().nullable(),
  discoDuro: z.string().max(50, "Maximo 50 caracteres").optional().nullable(),
  ram: z.string().max(20, "Maximo 20 caracteres").optional().nullable(),
  pulgadas: z
    .union([
      z
        .string()
        .transform((v) => parseFloat(v))
        .pipe(z.number().positive('Las pulgadas deben ser un valor positivo')),
      z.number().positive('Las pulgadas deben ser un valor positivo'),
    ])
    .optional()
    .nullable(),
  sistemaOperativo: z.string().max(50, "Maximo 50 caracteres").optional().nullable(),
  antivirus: z.string().max(100, "Maximo 100 caracteres").optional().nullable(),
  nombreEquipo: z.string().max(100, "Maximo 100 caracteres").optional().nullable(),

  // Specs Celular
  numeroTelefono: z.string().max(20, "Maximo 20 caracteres").optional().nullable(),
  numeroActivacion: z.string().max(20, "Maximo 20 caracteres").optional().nullable(),
  tipoPlan: z.string().max(50, "Maximo 50 caracteres").optional().nullable(),
  operador: z.string().max(50, "Maximo 50 caracteres").optional().nullable(),
  tieneCargador: z.boolean().optional(),

  // Estado y ubicacion
  estado: estadoActivoEnum.optional().default("disponible"),
  condicion: condicionActivoEnum.optional().default("nuevo"),
  ubicacionFisica: z.string().max(100, "Maximo 100 caracteres").optional().nullable(),

  // Software/Licencias
  microsoft365: z.boolean().optional(),
  intuneEnrolled: z.boolean().optional(),
  listaDistribucion: z.string().max(200, "Maximo 200 caracteres").optional().nullable(),

  // Fechas (acepta YYYY-MM-DD o ISO 8601 completo)
  fechaCompra: z.string().optional().nullable(),
  fechaGarantiaFin: z.string().optional().nullable(),
  fechaBaja: z.string().optional().nullable(),

  // Observaciones e incidencias
  observaciones: z.string().optional().nullable(),
  incidencia: z.string().optional().nullable(),
});

// Schema para crear activo (campos requeridos)
export const createAssetSchema = assetSchema.extend({
  categoriaId: z.string().uuid("ID de categoria invalido"),
  marca: z.string().min(1, "La marca es requerida").max(50, "Maximo 50 caracteres"),
  modelo: z.string().min(1, "El modelo es requerido").max(100, "Maximo 100 caracteres"),
});

// Schema para actualizar activo (todos opcionales)
export const updateAssetSchema = assetSchema.partial();

// Tipos TypeScript derivados
export type AssetInput = z.infer<typeof assetSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type EstadoActivo = z.infer<typeof estadoActivoEnum>;
export type CondicionActivo = z.infer<typeof condicionActivoEnum>;
