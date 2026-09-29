import { z } from 'zod';

/**
 * Reglas de Configuracion > Sedes (SPEC 2.112.6). El nombre repetido se
 * revisa en la ruta, contra la base.
 */
const nombre = z
  .string({ error: 'Escribe el nombre' })
  .trim()
  .min(1, 'Escribe el nombre')
  .max(100, 'Máximo 100 caracteres');

export const crearSedeSchema = z.object({
  codigo: z
    .string({ error: 'Escribe el código' })
    .trim()
    .min(1, 'Escribe el código')
    .max(12, 'Máximo 12 caracteres')
    .regex(/^[A-Za-z0-9_-]+$/, 'Solo letras, números, guion y guion bajo')
    .transform((c) => c.toUpperCase()),
  nombre,
  activa: z.boolean().optional(),
});

// El codigo no se edita: es la referencia estable de la sede.
export const editarSedeSchema = z.object({
  nombre: nombre.optional(),
  activa: z.boolean({ error: 'Valor inválido' }).optional(),
});
