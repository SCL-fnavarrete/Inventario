import { z } from "zod";
import type {
  EstadoActivo as PrismaEstadoActivo,
  CondicionActivo as PrismaCondicionActivo,
} from "@prisma/client";

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
  // Todo equipo que se registra nace disponible: es la unica posicion inicial
  // que el formulario puede respaldar con datos. 'asignado' exige empleado y
  // asignacion (eso lo hace la importacion, no el alta manual) y 'reutilizable'
  // significa "volvio de un empleado", que un equipo recien creado no hizo.
  // El desgaste fisico no va aqui: para eso esta el campo condicion.
  estado: z.literal("disponible").optional().default("disponible"),
});

// Schema para actualizar activo (todos opcionales)
export const updateAssetSchema = assetSchema.partial();

// Tipos TypeScript derivados
export type AssetInput = z.infer<typeof assetSchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
/**
 * Guardia de sincronizacion entre Prisma y Zod.
 *
 * El dominio se define dos veces: en el enum de Prisma (la base) y en el de
 * Zod (la frontera de validacion). Nada obligaba a que coincidieran, y de ahi
 * salio el bug de condicion: la base decia nuevo|usado|danado mientras la UI
 * mostraba etiquetas para bueno|regular|malo, que no existian.
 *
 * `MismoConjunto` exige asignabilidad en ambas direcciones. Si alguien anade
 * un valor a un lado y no al otro, esto deja de compilar y el CI lo detiene
 * antes de que llegue a produccion.
 */
// Devuelve false (no never) cuando divergen: `never extends true` se cumple,
// asi que una version con never dejaria pasar la divergencia en silencio.
type MismoConjunto<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Exigir<T extends true> = T;

export type EstadoSincronizado = Exigir<MismoConjunto<z.infer<typeof estadoActivoEnum>, PrismaEstadoActivo>>;
export type CondicionSincronizada = Exigir<MismoConjunto<z.infer<typeof condicionActivoEnum>, PrismaCondicionActivo>>;

export type EstadoActivo = z.infer<typeof estadoActivoEnum>;
export type CondicionActivo = z.infer<typeof condicionActivoEnum>;
