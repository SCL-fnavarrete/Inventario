import { z } from 'zod';
import { fechaTextoOpcional, textoLibre } from '@/shared/validaciones/comunes';

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
  numero: z.string().transform((v, ctx) => {
    const n = normalizarNumero(v);
    if (!n) ctx.addIssue({ code: 'custom', message: 'Escribe un celular de 9 dígitos (ej: 9 1234 5678)' });
    return n ?? '';
  }),
  // Sin estado, la linea queda Activa.
  estadoId: idOpcional,
  // Desde cuando rige un cambio de estado (por defecto, hoy).
  vigenteDesde: fechaTextoOpcional,
  tipoChipId: idOpcional,
  // Compania de la linea (catalogo).
  operadorId: idOpcional,
  activoId: idOpcional,
  empleadoId: idOpcional,
  // Sede donde se guarda el chip mientras esta disponible (opcional, SPEC 2.165).
  sedeId: idOpcional,
  observaciones: textoLibre(),
});

export type DatosLinea = z.infer<typeof lineaSchema>;

/**
 * Una linea nueva creada a mano (formulario o API) lleva tipo de chip y
 * operador. Las que vienen de
 * una importacion pueden no traerlos todavia: la importacion no pasa por aqui,
 * y editar una linea que ya existe tampoco lo exige.
 */
export const lineaNuevaSchema = lineaSchema.superRefine((d, ctx) => {
  const falta = (campo: keyof DatosLinea, message: string) => ctx.addIssue({ code: 'custom', path: [campo], message });
  if (!d.tipoChipId) falta('tipoChipId', 'Elige el tipo de chip');
  if (!d.operadorId) falta('operadorId', 'Elige el operador');
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
export const CATALOGOS_LINEA = ['estados', 'tipos-chip', 'operadores', 'motivos', 'motivos-baja'] as const;
export type CatalogoLinea = (typeof CATALOGOS_LINEA)[number];

/** Opcion de un catalogo editable (tipos de chip, operadores y motivos): el nombre y, en un tipo de chip, si va sin celular. */
export const opcionLineaSchema = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre').max(100, 'Máximo 100 caracteres'),
  // Solo un tipo de chip: va sin celular de la empresa (eSIM / MFF).
  sinCelular: z.boolean().optional(),
});
export type DatosOpcionLinea = z.infer<typeof opcionLineaSchema>;

/**
 * Los estados de una linea son dos y fijos (por clave); no se agregan ni se
 * cambian. "Disponible" no es un estado: es una linea activa sin persona.
 */
export const DESCRIPCION_ESTADO: Record<string, string> = {
  activa: 'La línea está contratada y funcionando. Si no tiene persona, está disponible para asignar.',
  baja: 'Ya no se usa: el contrato terminó. Queda con su fecha de baja.',
};

/** Color del estado en pantalla: Activa verde, de baja gris. */
export const tonoEstadoLinea = (e: { deBaja: boolean }) => (e.deBaja ? 'neutral' : 'success');

/**
 * Asignar o mover una linea disponible (SPEC 2.131, 2.167): a un telefono de la
 * empresa sin linea, a una persona (eSIM) o dejarla disponible. Con `tipoChipId`
 * cambia ademas su tipo (eSIM <-> chip fisico) en el mismo paso, con el mismo
 * numero. Rige desde ahora. Nunca cambia quien tiene un telefono: eso se hace
 * en Asignaciones.
 */
export const reasignacionSchema = z
  .object({
    destino: z.enum(['telefono', 'persona', 'ninguno'] satisfies DestinoLinea[]),
    activoId: idOpcional,
    empleadoId: idOpcional,
    // El tipo de chip nuevo, si cambia (SPEC 2.167).
    tipoChipId: idOpcional,
    motivoId: idOpcional,
    // Lo usan las solicitudes para anotar de donde viene el cambio.
    detalle: textoLibre(500),
  })
  .superRefine((d, ctx) => {
    if (d.destino === 'telefono' && !d.activoId) ctx.addIssue({ code: 'custom', path: ['activoId'], message: 'Elige el teléfono' });
    if (d.destino === 'persona' && !d.empleadoId) ctx.addIssue({ code: 'custom', path: ['empleadoId'], message: 'Elige la persona' });
  });
export type DatosReasignacion = z.infer<typeof reasignacionSchema>;

/**
 * Dar de baja una linea (SPEC 2.140), igual que un equipo: el motivo de la lista
 * ("Otro" pide detalle, lo revisa el servicio que conoce la lista), la fecha (por
 * defecto, hoy) y una observacion opcional.
 */
export const bajaLineaSchema = z.object({
  motivoBajaId: z.string({ error: 'Elige el motivo de la baja' }).uuid('Elige el motivo de la baja'),
  motivoDetalle: z.string().max(500, 'Máximo 500 caracteres').optional().nullable(),
  observaciones: z.string().max(1000, 'Máximo 1000 caracteres').optional().nullable(),
  fechaBaja: fechaTextoOpcional,
});
export type DatosBajaLinea = z.infer<typeof bajaLineaSchema>;
