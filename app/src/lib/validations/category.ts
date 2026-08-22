import { z } from 'zod';

export const tipoDevolucionEnum = z.enum(['notebook', 'celular', 'monitor', 'kit', 'otro'], {
  error: 'Tipo de devolución inválido',
});

const categoryFields = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(50, 'Máximo 50 caracteres'),
  descripcion: z
    .string()
    .trim()
    .max(500, 'Máximo 500 caracteres')
    .optional()
    .nullable()
    .transform((value) => (value === '' ? null : value)),
  requiereSerie: z.boolean().optional(),
  requiereImei: z.boolean().optional(),
  tipoDevolucion: tipoDevolucionEnum.optional(),
});

export const createCategorySchema = categoryFields.extend({
  requiereSerie: z.boolean().default(true),
  requiereImei: z.boolean().default(false),
  tipoDevolucion: tipoDevolucionEnum.default('otro'),
});

export const updateCategorySchema = categoryFields
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Debe enviar al menos un campo para actualizar');

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type TipoDevolucion = z.infer<typeof tipoDevolucionEnum>;
