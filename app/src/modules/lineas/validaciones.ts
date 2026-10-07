import { z } from 'zod';
import { MAX_CANTIDAD, fechaTextoOpcional, textoLibre } from '@/shared/validaciones/comunes';

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

/** Precio en pesos: vacio = sin precio (no 0). */
export const precioOpcional = z.preprocess(
  (v) => (v === '' || v == null ? null : v),
  z.coerce.number().int('Debe ser un número entero').min(0, 'No puede ser negativo').max(MAX_CANTIDAD, 'Máximo 1.000.000').nullable()
);

export const lineaSchema = z.object({
  numero: z.string().transform((v, ctx) => {
    const n = normalizarNumero(v);
    if (!n) ctx.addIssue({ code: 'custom', message: 'Escribe un celular de 9 dígitos (ej: 9 1234 5678)' });
    return n ?? '';
  }),
  planId: idOpcional,
  precioMensual: precioOpcional,
  // Sin estado, la linea queda Activa.
  estadoId: idOpcional,
  // Desde cuando rige un cambio de precio o de estado (por defecto, hoy).
  vigenteDesde: fechaTextoOpcional,
  tipoChipId: idOpcional,
  // Compania de la linea (catalogo).
  operadorId: idOpcional,
  activoId: idOpcional,
  empleadoId: idOpcional,
  // Sede donde esta la linea (el formulario propone la del navbar).
  sedeId: idOpcional,
  observaciones: textoLibre(),
});

export type DatosLinea = z.infer<typeof lineaSchema>;

/**
 * Una linea nueva creada a mano (formulario o API) lleva plan, precio, tipo de
 * chip, operador y sede (la que la registra y la gestiona). Las que vienen de
 * una importacion pueden no traerlos todavia: la importacion no pasa por aqui,
 * y editar una linea que ya existe tampoco lo exige.
 */
export const lineaNuevaSchema = lineaSchema.superRefine((d, ctx) => {
  const falta = (campo: keyof DatosLinea, message: string) => ctx.addIssue({ code: 'custom', path: [campo], message });
  if (!d.planId) falta('planId', 'Elige el plan');
  if (d.precioMensual == null) falta('precioMensual', 'Escribe el precio mensual');
  if (!d.tipoChipId) falta('tipoChipId', 'Elige el tipo de chip');
  if (!d.operadorId) falta('operadorId', 'Elige el operador');
  if (!d.sedeId) falta('sedeId', 'Elige la sede');
});

/** A que se asocia una linea: un telefono de la empresa, una persona o nada. */
export type DestinoLinea = 'telefono' | 'persona' | 'ninguno';

/**
 * Regla de asociacion (SPEC 2.131): un chip fisico va en un telefono de la
 * empresa; una eSIM, con una persona (la usa en su telefono personal). Sin tipo
 * de chip no se asocia a nada. Siempre puede quedar sin asignar.
 */
export function destinosPermitidos(tipoChip: { sinCelular?: boolean } | null | undefined): DestinoLinea[] {
  if (!tipoChip) return ['ninguno'];
  return tipoChip.sinCelular ? ['persona', 'ninguno'] : ['telefono', 'ninguno'];
}

/** Por que una linea con ese tipo de chip no va a ese destino (null si puede). */
export function errorDeAsociacion(tipoChip: { sinCelular?: boolean } | null | undefined, destino: DestinoLinea): string | null {
  if (destinosPermitidos(tipoChip).includes(destino)) return null;
  if (!tipoChip) return 'Indica primero el tipo de chip de la línea';
  return tipoChip.sinCelular
    ? 'Una línea eSIM no va en un celular de la empresa: se asocia a una persona'
    : 'Una línea con chip físico va en un celular de la empresa, no directo a una persona';
}

/** Los catalogos de las lineas (SPEC 2.131): su segmento en la URL. */
export const CATALOGOS_LINEA = ['planes', 'estados', 'tipos-chip', 'operadores', 'motivos'] as const;
export type CatalogoLinea = (typeof CATALOGOS_LINEA)[number];

/** Opcion de un catalogo editable (planes y tipos de chip): el nombre y, en un plan, su precio de referencia. */
export const opcionLineaSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(100, 'Máximo 100 caracteres'),
  precioMensual: precioOpcional.optional(),
  // Solo un tipo de chip: va sin celular de la empresa (eSIM / MFF).
  sinCelular: z.boolean().optional(),
});
export type DatosOpcionLinea = z.infer<typeof opcionLineaSchema>;

/**
 * Los estados de una linea son cinco y fijos (por clave): son los de su ciclo
 * de vida, no se agregan ni se cambian. Que significa cada uno.
 */
export const DESCRIPCION_ESTADO: Record<string, string> = {
  activa: 'La línea está contratada y funcionando. Es el estado normal. Cuenta en el costo.',
  suspendida:
    'Cortada o en pausa por un tiempo (por ejemplo, pérdida del chip, falta de pago o una pausa pedida por la empresa). Sigue contratada y cuenta en el costo.',
  portabilidad:
    'El número se está cambiando de compañía: es un trámite en curso. Al terminar pasa a Activa (llegó) o a Dada de baja (se fue). Cuenta en el costo mientras tanto.',
  baja: 'Ya no se usa ni se paga: el contrato terminó. No cuenta en el costo y queda con su fecha de baja.',
  por_confirmar:
    'Está en la factura del operador, pero no se sabe quién la usa: hay que confirmarlo. Al saberlo pasa a Activa (y se asigna) o a Dada de baja. Cuenta en el costo mientras tanto.',
};

/** Color del estado en pantalla: Activa verde, de baja gris, y lo que hay que mirar (suspendida, en portabilidad, por confirmar) ambar. */
export const tonoEstadoLinea = (e: { deBaja: boolean; clave?: string | null }) =>
  e.deBaja ? 'neutral' : e.clave === 'activa' ? 'success' : 'warning';

/**
 * Reasignar una linea (SPEC 2.131): a un telefono de la empresa (la persona sale
 * de el), a una persona (eSIM o telefono personal) o sin asignar. En los tres
 * casos se indica la sede donde queda (opcional). Nunca cambia quien tiene un telefono: eso
 * se hace en Asignaciones.
 */
export const reasignacionSchema = z
  .object({
    destino: z.enum(['telefono', 'persona', 'ninguno'] satisfies DestinoLinea[]),
    activoId: idOpcional,
    empleadoId: idOpcional,
    sedeId: idOpcional,
    // Desde cuando rige (por defecto, ahora).
    desde: fechaTextoOpcional,
    motivoId: idOpcional,
    detalle: textoLibre(500),
  })
  .superRefine((d, ctx) => {
    if (d.destino === 'telefono' && !d.activoId) ctx.addIssue({ code: 'custom', path: ['activoId'], message: 'Elige el teléfono' });
    if (d.destino === 'persona' && !d.empleadoId) ctx.addIssue({ code: 'custom', path: ['empleadoId'], message: 'Elige la persona' });
  });
export type DatosReasignacion = z.infer<typeof reasignacionSchema>;
