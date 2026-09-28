import { z } from "zod";
import { cantidad } from "./comunes";
import { rutOptionalSchema } from "./rut";
import { createAssetSchema, revisarOrdenGarantia } from "./asset";

export const TipoCompraEnum = z.enum(["FACTURA", "GASTO_MENOR"]);

// Schema para crear una compra/factura: solo la factura (para
// relacionarla) y los equipos que vinieron con ella, sin catalogo de
// proveedor ni datos financieros (ver nota en el modelo Purchase).
export const createPurchaseSchema = z.object({
  // Sede de llegada (SPEC 2.111): donde llega lo comprado. Obligatoria.
  sedeId: z.string({ error: "Elige la sede de llegada" }).uuid("Elige la sede de llegada"),
  numeroFactura: z
    .string()
    .max(50, "Máximo 50 caracteres")
    .optional()
    .nullable(),
  fechaFactura: z.string().transform((val) => new Date(val)),
  // RUT de quien emitio la factura: texto libre validado con digito
  // verificador, no referencia al catalogo Supplier.
  rutProveedor: rutOptionalSchema,
  tipoCompra: TipoCompraEnum.default("FACTURA"),
  descripcion: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
  compradoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  ordenCompra: z
    .string()
    .max(50, "Máximo 50 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
});

// Schema para actualizar una compra/factura
export const updatePurchaseSchema = z.object({
  sedeId: z.string().uuid("Sede inválida").optional().nullable(),
  numeroFactura: z
    .string()
    .max(50, "Máximo 50 caracteres")
    .optional()
    .nullable(),
  fechaFactura: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  rutProveedor: rutOptionalSchema,
  tipoCompra: TipoCompraEnum.optional(),
  descripcion: z.string().max(500, "Máximo 500 caracteres").optional().nullable(),
  compradoPor: z.string().max(100, "Máximo 100 caracteres").optional().nullable(),
  ordenCompra: z
    .string()
    .max(50, "Máximo 50 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
});

// Equipo comprado (SPEC 2.111): los mismos datos y reglas que Activos >
// Nuevo. La sede y el estado no se eligen: nace "Por repartir" en la sede
// de llegada.
// `.omit()` descarta el refinamiento de fechas de createAssetSchema: se
// vuelve a aplicar aqui.
export const equipoNuevoCompraSchema = createAssetSchema
  .omit({ estado: true })
  .superRefine(revisarOrdenGarantia);

/** Un mismo N° de serie dos veces en la lista de equipos nuevos. */
function revisarSeriesRepetidas(
  equipos: { numeroSerie?: string | null; imei?: string | null }[],
  ctx: z.RefinementCtx
) {
  const vistas = new Set<string>();
  const imeis = new Set<string>();
  for (const e of equipos) {
    // El IMEI tampoco se repite dentro de la misma compra (SPEC 2.112.7).
    if (e.imei) {
      if (imeis.has(e.imei)) {
        ctx.addIssue({ code: "custom", path: ["equiposNuevos"], message: `El IMEI ${e.imei} está dos veces en la lista` });
      }
      imeis.add(e.imei);
    }
    const serie = e.numeroSerie?.trim().toUpperCase();
    if (!serie) continue;
    if (vistas.has(serie)) {
      ctx.addIssue({
        code: "custom",
        path: ["equiposNuevos"],
        message: `El N° de serie ${e.numeroSerie} está dos veces en la lista`,
      });
    }
    vistas.add(serie);
  }
}

// Schema para agregar equipos a una compra ya creada: equipos comprados
// (nacen "Por repartir") y/o equipos que ya existian (solo se vinculan).
export const agregarEquiposCompraSchema = z
  .object({
    assetIds: z.array(z.string().uuid("ID de activo inválido")).default([]),
    equiposNuevos: z.array(equipoNuevoCompraSchema).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.assetIds.length === 0 && data.equiposNuevos.length === 0) {
      ctx.addIssue({ code: "custom", path: ["equiposNuevos"], message: "Agrega al menos un equipo" });
    }
    revisarSeriesRepetidas(data.equiposNuevos, ctx);
  });

// Schema para un solo activo vinculado
export const purchaseAssetSchema = z.object({
  assetId: z.string().uuid("ID de activo inválido"),
});

// Schema para una linea de compra de Kit/EPP: a diferencia de un activo, no
// se referencia una unidad individual sino una cantidad que suma al stock.
export const purchaseKitItemSchema = z.object({
  itemId: z.string().uuid("ID de artículo inválido"),
  cantidad: cantidad(1, "La cantidad debe ser al menos 1"),
});

// Schema para vincular articulos de Kit/EPP a una compra
export const linkKitItemsToPurchaseSchema = z.object({
  items: z
    .array(purchaseKitItemSchema)
    .min(1, "Debe agregar al menos un artículo"),
});

// Schema para crear compra con activos y/o artículos de Kit/EPP incluidos
export const createPurchaseWithAssetsSchema = createPurchaseSchema
  .extend({
    // Equipos que ya existian: solo se vinculan a la factura.
    assets: z
      .array(purchaseAssetSchema)
      .optional()
      .default([]),
    // Equipos comprados: se crean "Por repartir" al guardar la compra
    // (SPEC 2.111), nunca antes, asi no quedan equipos sueltos si se cancela.
    equiposNuevos: z.array(equipoNuevoCompraSchema).optional().default([]),
    kitItems: z
      .array(purchaseKitItemSchema)
      .optional()
      .default([]),
  })
  // Se exige al menos una linea: equipo (nuevo o existente) o articulo de kit.
  .superRefine((data, ctx) => {
    const sinEquipos = data.assets.length === 0 && data.equiposNuevos.length === 0;
    const sinKit = data.kitItems.length === 0;
    if (sinEquipos && sinKit) {
      ctx.addIssue({
        code: "custom",
        path: ["lineas"],
        message:
          "Agrega al menos un equipo o un artículo de Kit/EPP: una factura sin nada asociado no registra nada.",
      });
    }
    revisarSeriesRepetidas(data.equiposNuevos, ctx);
  });

// Schema para filtros de búsqueda de compras
export const purchaseFiltersSchema = z.object({
  search: z.string().optional(),
  sedeId: z.string().uuid().optional(),
  tipoCompra: TipoCompraEnum.optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z
    .enum(["fechaFactura", "createdAt", "numeroFactura"])
    .default("fechaFactura"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Tipos inferidos
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
export type AgregarEquiposCompraInput = z.infer<typeof agregarEquiposCompraSchema>;
export type PurchaseAssetInput = z.infer<typeof purchaseAssetSchema>;
export type PurchaseKitItemInput = z.infer<typeof purchaseKitItemSchema>;
export type LinkKitItemsToPurchaseInput = z.infer<typeof linkKitItemsToPurchaseSchema>;
export type CreatePurchaseWithAssetsInput = z.infer<typeof createPurchaseWithAssetsSchema>;
export type PurchaseFilters = z.infer<typeof purchaseFiltersSchema>;

/** Nombre de cada dato de la factura en el resumen de errores. */
export const ETIQUETAS_FACTURA: Record<string, string> = {
  sedeId: "Sede de llegada",
  numeroFactura: "N° de factura",
  fechaFactura: "Fecha de la factura",
  rutProveedor: "RUT del proveedor",
  lineas: "Equipos o artículos",
  equiposNuevos: "Equipos",
  kitItem: "Artículo de Kit/EPP",
};

/**
 * Datos de la factura que faltan o estan mal (SPEC 2.103), para Nueva compra
 * y Editar compra. Sede, N° y fecha son obligatorios en pantalla; el RUT del
 * proveedor es opcional, pero si se escribe debe ser valido (misma regla que
 * el servidor).
 */
export function validarDatosFactura(v: {
  sedeId: string;
  numeroFactura: string;
  fechaFactura: string;
  rutProveedor: string;
}): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.sedeId) e.sedeId = "Elige la sede de llegada";
  if (!v.numeroFactura.trim()) e.numeroFactura = "Escribe el número de factura";
  if (!v.fechaFactura) e.fechaFactura = "Elige la fecha de la factura";
  const rut = rutOptionalSchema.safeParse(v.rutProveedor.trim() || null);
  if (!rut.success) e.rutProveedor = rut.error.issues[0].message;
  return e;
}

/**
 * Repartir parte de una compra a una sede (SPEC 2.111.3): equipos "Por
 * repartir" y cantidades de Kit/EPP. Los datos del despacho (`envio`) solo
 * se piden si la sede destino no es la de llegada; se revisan con las
 * mismas reglas que un despacho del modulo (validarDatosDespacho).
 */
export const repartoCompraSchema = z
  .object({
    sedeDestinoId: z.string({ error: "Elige la sede destino" }).uuid("Elige la sede destino"),
    equipos: z.array(z.string().uuid("ID de equipo inválido")).default([]),
    kit: z
      .array(
        z.object({
          lineaId: z.string().uuid("Línea inválida"),
          cantidad: cantidad(1, "La cantidad debe ser al menos 1"),
        })
      )
      .default([]),
    envio: z
      .object({
        otChilexpress: z.string().optional(),
        fechaDespacho: z.string().optional(),
        fechaEstimadaLlegada: z.string().nullable().optional(),
        receptorNombre: z.string().optional(),
        receptorRut: z.string().optional(),
        observaciones: z.string().nullable().optional(),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.equipos.length === 0 && data.kit.length === 0) {
      ctx.addIssue({ code: "custom", path: ["reparto"], message: "Elige al menos un equipo o una cantidad de Kit/EPP" });
    }
    const lineas = data.kit.map((k) => k.lineaId);
    if (new Set(lineas).size !== lineas.length) {
      ctx.addIssue({ code: "custom", path: ["kit"], message: "Una línea de Kit/EPP está repetida" });
    }
  });

export type RepartoCompraInput = z.infer<typeof repartoCompraSchema>;
