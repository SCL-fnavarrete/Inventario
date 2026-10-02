import { z } from 'zod';
import { MAX_CANTIDAD, textoLibre } from '@/shared/validaciones/comunes';

/**
 * Numero de una linea como se guarda: solo digitos y con el 56 delante.
 * "+56 9 1234 5678" y "912345678" quedan "56912345678". Si no es un celular
 * chileno valido devuelve null.
 */
export function normalizarNumero(texto: string): string | null {
  const d = texto.replace(/\D/g, '');
  const numero = d.length === 9 ? `56${d}` : d;
  return /^569\d{8}$/.test(numero) ? numero : null;
}

/** Para mostrar: "+56 9 1234 5678". */
export function formatearNumero(numero: string): string {
  return numero.replace(/^56(\d)(\d{4})(\d{4})$/, '+56 $1 $2 $3');
}

const idOpcional = z.string().uuid().optional().nullable().or(z.literal('').transform(() => null));

export const lineaSchema = z.object({
  numero: z
    .string()
    .transform((v, ctx) => {
      const n = normalizarNumero(v);
      if (!n) ctx.addIssue({ code: 'custom', message: 'Escribe un celular de 9 dígitos (ej: 9 1234 5678)' });
      return n ?? '';
    }),
  plan: z.string().trim().max(100, 'Máximo 100 caracteres').optional().nullable(),
  // Vacio = sin precio (no 0).
  precioMensual: z.preprocess(
    (v) => (v === '' || v == null ? null : v),
    z.coerce.number().int('Debe ser un número entero').min(0, 'No puede ser negativo').max(MAX_CANTIDAD, 'Máximo 1.000.000').nullable()
  ),
  estado: z.enum(['activa', 'baja']).default('activa'),
  activoId: idOpcional,
  empleadoId: idOpcional,
  responsable: z.string().trim().max(200, 'Máximo 200 caracteres').optional().nullable(),
  observaciones: textoLibre(),
});

export type DatosLinea = z.infer<typeof lineaSchema>;
