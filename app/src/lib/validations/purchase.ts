import { z } from "zod";
import { rutOptionalSchema } from "./rut";

export const TipoCompraEnum = z.enum(["FACTURA", "GASTO_MENOR"]);

// Schema para crear una compra/factura
// Compras se simplifico el 11-sep-2026 (pedido explicito de Javier) a solo
// dos datos: la factura (para relacionarla) y los equipos que vinieron con
// ella. Se eliminaron el catalogo de proveedor y todo dato financiero
// (monto, moneda, metodo de pago, precio unitario) -- ver nota en el
// modelo Purchase. El mismo dia se agrego `rutProveedor` como texto libre
// (sin catalogo) y se quito `documentoUrl`, que ya no se usaba.
export const createPurchaseSchema = z.object({
  // A que sede se le atribuye la compra (9-sep-2026). Opcional para
  // permitir compras transversales sin sede.
  sedeId: z.string().uuid("Sede inválida").optional().nullable(),
  numeroFactura: z
    .string()
    .max(50, "Máximo 50 caracteres")
    .optional()
    .nullable(),
  fechaFactura: z.string().transform((val) => new Date(val)),
  // RUT de quien emitio la factura (11-sep-2026). Texto libre validado con
  // digito verificador -- no referencia al catalogo Supplier. Ver nota en
  // el modelo Purchase.
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

// Schema para vincular activos a una compra
export const linkAssetsToPurchaseSchema = z.object({
  assetIds: z
    .array(z.string().uuid("ID de activo inválido"))
    .min(1, "Debe seleccionar al menos un activo"),
});

// Schema para un solo activo vinculado
export const purchaseAssetSchema = z.object({
  assetId: z.string().uuid("ID de activo inválido"),
});

// Schema para una linea de compra de Kit/EPP (14-sep-2026, SPEC 2.36): a
// diferencia de un activo, no se referencia una unidad individual sino una
// cantidad que suma al stock del articulo.
export const purchaseKitItemSchema = z.object({
  itemId: z.string().uuid("ID de artículo inválido"),
  cantidad: z.coerce.number().int().min(1, "La cantidad debe ser al menos 1"),
});

// Schema para vincular articulos de Kit/EPP a una compra
export const linkKitItemsToPurchaseSchema = z.object({
  items: z
    .array(purchaseKitItemSchema)
    .min(1, "Debe agregar al menos un artículo"),
});

// Schema para crear compra con activos y/o artículos de Kit/EPP incluidos
export const createPurchaseWithAssetsSchema = createPurchaseSchema.extend({
  assets: z
    .array(purchaseAssetSchema)
    .optional()
    .default([]),
  kitItems: z
    .array(purchaseKitItemSchema)
    .optional()
    .default([]),
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
export type LinkAssetsToPurchaseInput = z.infer<typeof linkAssetsToPurchaseSchema>;
export type PurchaseAssetInput = z.infer<typeof purchaseAssetSchema>;
export type PurchaseKitItemInput = z.infer<typeof purchaseKitItemSchema>;
export type LinkKitItemsToPurchaseInput = z.infer<typeof linkKitItemsToPurchaseSchema>;
export type CreatePurchaseWithAssetsInput = z.infer<typeof createPurchaseWithAssetsSchema>;
export type PurchaseFilters = z.infer<typeof purchaseFiltersSchema>;
