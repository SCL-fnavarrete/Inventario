import { z } from "zod";
import { textoLibre, fechaTextoOpcional } from "./comunes";
import { normalizarImei, validarImei } from "@/lib/validations/imei";
import {
  MENSAJE_GARANTIA_ANTES_DE_COMPRA,
  terminaAntesDeEmpezar,
} from "@/lib/validations/ordenFechas";
import type {
  EstadoActivo as PrismaEstadoActivo,
  CondicionActivo as PrismaCondicionActivo,
} from "@prisma/client";

// Estados de activos validos
export const estadoActivoEnum = z.enum([
  "disponible",
  "asignado",
  "en_mantencion",
  "por_repartir",
  "baja",
  "vendido",
  "no_devuelto",
  "en_transito",
]);

// Condiciones de activos validas
export const condicionActivoEnum = z.enum(["nuevo", "usado", "danado"]);

// Schema base para activos
export const assetSchema = z.object({
  categoriaId: z.string().uuid("ID de categoría inválido"),

  // Identificacion
  numeroSerie: z.string().max(50, "Máximo 50 caracteres").optional().nullable(),
  // Se guarda solo con digitos; si viene, debe ser un IMEI valido (SPEC
  // 2.112.7). Que un celular lo traiga lo exige la regla del servidor, que
  // conoce la categoria (reglasIdentificacion).
  imei: z.preprocess(
    (v) => (typeof v === "string" ? normalizarImei(v) || null : v),
    z
      .string()
      .max(40, "Máximo 40 caracteres")
      .nullish()
      .superRefine((v, ctx) => {
        const error = v ? validarImei(v) : null;
        if (error) ctx.addIssue({ code: "custom", message: error });
      })
  ),

  // Datos generales
  marca: z.string().trim().min(1, "La marca es requerida").max(50, "Máximo 50 caracteres"),
  modelo: z.string().trim().min(1, "El modelo es requerido").max(100, "Máximo 100 caracteres"),

  // Specs Notebook/PC
  procesador: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  discoDuro: z.string().max(50, "Máximo 50 caracteres").optional().nullable(),
  ram: z.string().max(20, "Máximo 20 caracteres").optional().nullable(),
  pulgadas: z
    .union([
      z
        .string()
        .transform((v) => parseFloat(v))
        .pipe(z.number().positive('Las pulgadas deben ser un valor positivo').max(999, 'Máximo 999')),
      z.number().positive('Las pulgadas deben ser un valor positivo').max(999, 'Máximo 999'),
    ])
    .optional()
    .nullable(),
  sistemaOperativo: z.string().max(50, "Máximo 50 caracteres").optional().nullable(),
  antivirus: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  nombreEquipo: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),

  // Specs Celular
  numeroTelefono: z.string().max(20, "Máximo 20 caracteres").optional().nullable(),
  numeroActivacion: z.string().max(20, "Máximo 20 caracteres").optional().nullable(),
  tipoPlan: z.string().max(50, "Máximo 50 caracteres").optional().nullable(),
  tieneCargador: z.boolean().optional(),

  // Conectividad compartida: Mouse, Teclado, Webcam, Audifonos
  conectividad: z.string().max(20, "Máximo 20 caracteres").optional().nullable(),

  // Estado y ubicacion
  estado: estadoActivoEnum.optional().default("disponible"),
  condicion: condicionActivoEnum.optional().default("nuevo"),
  ubicacionFisica: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),

  // Software/Licencias
  microsoft365: z.boolean().optional(),
  // Nombre del plan/licencia (ej. "Premium", "E3").
  tipoLicenciaMicrosoft365: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  intuneEnrolled: z.boolean().optional(),
  listaDistribucion: z.string().max(200, "Máximo 200 caracteres").optional().nullable(),

  // Fechas (acepta YYYY-MM-DD o ISO 8601 completo). fechaBaja no se recibe:
  // la fija la baja en Mantenciones (SPEC 2.88), nunca una edicion.
  fechaCompra: fechaTextoOpcional,
  fechaGarantiaFin: fechaTextoOpcional,

  // Observaciones e incidencias
  observaciones: textoLibre(),
  incidencia: textoLibre(),
});

/**
 * El fin de garantia no puede caer antes de la compra. Se exporta porque
 * `.omit()` descarta los refinamientos: quien derive de createAssetSchema
 * (ej. los equipos de una compra) debe volver a aplicarla.
 */
export function revisarOrdenGarantia(
  datos: { fechaCompra?: string | null; fechaGarantiaFin?: string | null },
  ctx: z.RefinementCtx
): void {
  if (terminaAntesDeEmpezar(datos.fechaCompra, datos.fechaGarantiaFin)) {
    ctx.addIssue({
      code: "custom",
      path: ["fechaGarantiaFin"],
      message: MENSAJE_GARANTIA_ANTES_DE_COMPRA,
    });
  }
}

// Schema para crear activo (campos requeridos)
export const createAssetSchema = assetSchema.extend({
  categoriaId: z.string().uuid("ID de categoría inválido"),
  marca: z.string().trim().min(1, "La marca es requerida").max(50, "Máximo 50 caracteres"),
  modelo: z.string().trim().min(1, "El modelo es requerido").max(100, "Máximo 100 caracteres"),
  // Todo equipo que se registra nace disponible: es la unica posicion inicial
  // que el formulario puede respaldar con datos. 'asignado' exige empleado y
  // asignacion, eso lo hace la importacion, no el alta manual.
  // El desgaste fisico no va aqui: para eso esta el campo condicion.
  estado: z.literal("disponible").optional().default("disponible"),
}).superRefine(revisarOrdenGarantia);

// Schema para actualizar activo (todos opcionales). El orden compra/garantia
// lo revisa la ruta, que conoce la fecha ya guardada si solo llega una.
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
