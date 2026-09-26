import { z } from 'zod';

/**
 * Reglas de Configuracion > Catalogos de Activos > Categorias (SPEC 2.112.7).
 * El nombre repetido se revisa en la ruta, contra la base.
 */
export const TIPOS_FICHA_VALIDOS = ['computador', 'celular', 'monitor', 'periferico', 'generico'] as const;

export const categoriaSchema = z.object({
  nombre: z.string({ error: 'Escribe el nombre' }).trim().min(1, 'Escribe el nombre').max(100, 'Máximo 100 caracteres'),
  descripcion: z
    .string()
    .trim()
    .max(300, 'Máximo 300 caracteres')
    .nullish()
    .transform((v) => v || null),
  // Vacio no se guarda como 0 sin avisar: es un error.
  stockMinimo: z
    .union([z.number(), z.string().trim().min(1, 'Escribe el stock mínimo')], { error: 'Escribe el stock mínimo' })
    .pipe(z.coerce.number({ error: 'Debe ser un número' }))
    .pipe(z.number().int('Debe ser un número entero').min(0, 'No puede ser negativo').max(10000, 'Máximo 10.000'))
    .optional(),
  tipoFicha: z.enum(TIPOS_FICHA_VALIDOS, { error: 'Elige qué campos pide' }).optional(),
});

/** Nombre de una opcion de catalogo (sistema operativo, antivirus, licencia). */
export const opcionCatalogoSchema = z.object({
  nombre: z.string({ error: 'Escribe el nombre' }).trim().min(1, 'Escribe el nombre').max(100, 'Máximo 100 caracteres'),
});
