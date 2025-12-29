import { z } from "zod";

// Enum de moneda
export const MonedaEnum = z.enum(["CLP", "USD"]);

// Schema para crear una compra/factura
export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid("ID de proveedor inválido"),
  numeroFactura: z
    .string()
    .min(1, "El número de factura es requerido")
    .max(50, "Máximo 50 caracteres"),
  fechaFactura: z.string().transform((val) => new Date(val)),
  montoTotal: z
    .number()
    .positive("El monto debe ser positivo")
    .optional()
    .nullable(),
  moneda: MonedaEnum.default("CLP"),
  ordenCompra: z
    .string()
    .max(50, "Máximo 50 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  documentoUrl: z
    .string()
    .url("URL inválida")
    .max(500, "Máximo 500 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
});

// Schema para actualizar una compra/factura
export const updatePurchaseSchema = z.object({
  supplierId: z.string().uuid("ID de proveedor inválido").optional(),
  numeroFactura: z
    .string()
    .min(1, "El número de factura es requerido")
    .max(50, "Máximo 50 caracteres")
    .optional(),
  fechaFactura: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  montoTotal: z
    .number()
    .positive("El monto debe ser positivo")
    .optional()
    .nullable(),
  moneda: MonedaEnum.optional(),
  ordenCompra: z
    .string()
    .max(50, "Máximo 50 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
  documentoUrl: z
    .string()
    .url("URL inválida")
    .max(500, "Máximo 500 caracteres")
    .optional()
    .nullable()
    .transform((val) => val || null),
});

// Schema para vincular activos a una compra
export const linkAssetsToPurchaseSchema = z.object({
  assetIds: z
    .array(z.string().uuid("ID de activo inválido"))
    .min(1, "Debe seleccionar al menos un activo"),
  precioUnitario: z
    .number()
    .positive("El precio debe ser positivo")
    .optional()
    .nullable(),
});

// Schema para un solo activo vinculado
export const purchaseAssetSchema = z.object({
  assetId: z.string().uuid("ID de activo inválido"),
  precioUnitario: z
    .number()
    .positive("El precio debe ser positivo")
    .optional()
    .nullable(),
});

// Schema para crear compra con activos incluidos
export const createPurchaseWithAssetsSchema = createPurchaseSchema.extend({
  assets: z
    .array(purchaseAssetSchema)
    .optional()
    .default([]),
});

// Schema para filtros de búsqueda de compras
export const purchaseFiltersSchema = z.object({
  search: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  moneda: MonedaEnum.optional(),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  montoMin: z.coerce.number().optional(),
  montoMax: z.coerce.number().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z
    .enum(["fechaFactura", "createdAt", "montoTotal", "numeroFactura"])
    .default("fechaFactura"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

// Tipos inferidos
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
export type LinkAssetsToPurchaseInput = z.infer<typeof linkAssetsToPurchaseSchema>;
export type PurchaseAssetInput = z.infer<typeof purchaseAssetSchema>;
export type CreatePurchaseWithAssetsInput = z.infer<typeof createPurchaseWithAssetsSchema>;
export type PurchaseFilters = z.infer<typeof purchaseFiltersSchema>;
