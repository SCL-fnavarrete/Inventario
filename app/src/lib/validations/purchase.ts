import { z } from "zod";
import { rutOptionalSchema } from "./rut";

export const TipoCompraEnum = z.enum(["FACTURA", "GASTO_MENOR"]);

// Schema para crear una compra/factura: solo la factura (para
// relacionarla) y los equipos que vinieron con ella, sin catalogo de
// proveedor ni datos financieros (ver nota en el modelo Purchase).
export const createPurchaseSchema = z.object({
  // A que sede se le atribuye la compra; opcional para compras transversales.
  sedeId: z.string().uuid("Sede inválida").optional().nullable(),
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

// Schema para una linea de compra de Kit/EPP: a diferencia de un activo, no
// se referencia una unidad individual sino una cantidad que suma al stock.
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
export const createPurchaseWithAssetsSchema = createPurchaseSchema
  .extend({
    assets: z
      .array(purchaseAssetSchema)
      .optional()
      .default([]),
    kitItems: z
      .array(purchaseKitItemSchema)
      .optional()
      .default([]),
  })
  // Se exige al menos una linea (activo o articulo de kit) vinculada.
  .superRefine((data, ctx) => {
    const sinEquipos = !data.assets || data.assets.length === 0;
    const sinKit = !data.kitItems || data.kitItems.length === 0;
    if (sinEquipos && sinKit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets"],
        message:
          "Vincula al menos un equipo o un artículo de Kit/EPP: una factura sin nada asociado no registra nada.",
      });
    }
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
