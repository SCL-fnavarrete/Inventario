import { z } from 'zod';
import { pngSignatureSchema } from '@/lib/validations/signature';

/**
 * El snapshot de un documento emitido.
 *
 * Es la unica fuente de la que se renderiza un PDF ya emitido. Se guarda en
 * `documentos_emitidos.contenido_snapshot`, que la base protege contra
 * cualquier update (SPEC 2.1 ter), de modo que renombrar una categoria,
 * corregir un RUT o devolver un equipo no altera un acta ya firmada.
 *
 * Cada campo que la plantilla necesita esta aqui: si un dato no cabe en el
 * snapshot, el documento no puede afirmarlo.
 */

export const SNAPSHOT_VERSION = 1;

/** ISO 8601 con Z: el momento lo fija el servidor, nunca el cliente. */
const isoDateTime = z.string().datetime();

const tipoDevolucionSchema = z.enum(['notebook', 'celular', 'monitor', 'kit', 'otro']);

/**
 * `categoriaNombre` es el nombre observado al emitir —lo que el documento
 * dijo—, mientras `tipoDevolucion` es el valor estable de la Ola 2. Se guardan
 * los dos: uno es texto legible, el otro es la clasificacion que no cambia
 * cuando alguien renombra la categoria.
 */
const activoSnapshotSchema = z.object({
  assignmentId: z.string(),
  assetId: z.string(),
  categoriaNombre: z.string(),
  tipoDevolucion: tipoDevolucionSchema,
  marca: z.string(),
  modelo: z.string(),
  numeroSerie: z.string().nullable(),
  condicion: z.string(),
  procesador: z.string().nullable(),
  ram: z.string().nullable(),
  discoDuro: z.string().nullable(),
  sistemaOperativo: z.string().nullable(),
  imei: z.string().nullable(),
  numeroTelefono: z.string().nullable(),
  operador: z.string().nullable(),
});

const activoDevueltoSnapshotSchema = activoSnapshotSchema.extend({
  estadoDevolucion: z.string(),
});

const baseSchema = z.object({
  snapshotVersion: z.literal(SNAPSHOT_VERSION),
  numero: z.string().regex(/^DOC-\d{4}-\d{4,}$/),
  version: z.number().int().positive(),
  emitidoEn: isoDateTime,
  emitidoPor: z.string().min(1),
  empleado: z.object({
    id: z.string(),
    nombreCompleto: z.string().min(1),
    rut: z.string().nullable(),
    correo: z.string(),
    cargo: z.string().nullable(),
    fechaIngreso: isoDateTime.nullable(),
  }),
  solicitud: z
    .object({ id: z.string(), numero: z.string(), tipo: z.string() })
    .nullable()
    .optional(),
  // La aceptacion de la politica vive dentro del snapshot inmutable, no como
  // un flag editable en Employee o Assignment (SPEC 2.1 ter).
  aceptaPoliticaUso: z.literal(true),
  firma: z.object({
    imagenPng: pngSignatureSchema.nullable(),
    firmadaEn: isoDateTime.nullable(),
  }),
});

export const anexoEntregaSnapshotSchema = baseSchema.extend({
  tipo: z.literal('anexo_entrega'),
  fechaEntrega: isoDateTime,
  lugarEntrega: z.string().nullable(),
  gestionadoPor: z.string(),
  activos: z.array(activoSnapshotSchema),
});

export const comprobanteEntregaSnapshotSchema = baseSchema.extend({
  tipo: z.literal('comprobante_entrega'),
  fechaEntrega: isoDateTime,
  gestionadoPor: z.string(),
  activos: z.array(activoSnapshotSchema),
});

export const comprobanteCambioSnapshotSchema = baseSchema.extend({
  tipo: z.literal('comprobante_cambio'),
  fecha: isoDateTime,
  motivoCambio: z.string(),
  gestionadoPor: z.string(),
  /**
   * El equipo que sale, con el estado en que volvio.
   *
   * `estadoDevolucion` esta aqui porque el comprobante lo afirma: sin capturarlo,
   * el documento imprimia "Devolucion OK" como literal fijo aunque el tecnico
   * hubiera declarado `danado`, y la clausula de responsabilidad por danos se
   * apoya justo en ese dato.
   */
  equipoAnterior: activoSnapshotSchema
    .extend({ estadoDevolucion: z.string().nullable() })
    .nullable(),
  equipoNuevo: activoSnapshotSchema.nullable(),
});

export const actaDevolucionSnapshotSchema = baseSchema.extend({
  tipo: z.literal('acta_devolucion'),
  fechaInicio: isoDateTime.nullable(),
  fechaTermino: isoDateTime.nullable(),
  fechaDevolucion: isoDateTime,
  lugarDevolucion: z.string().nullable(),
  recibidoPor: z.string(),
  observaciones: z.string().nullable(),
  activos: z.array(activoDevueltoSnapshotSchema),
});

export const documentoSnapshotSchema = z.discriminatedUnion('tipo', [
  anexoEntregaSnapshotSchema,
  comprobanteEntregaSnapshotSchema,
  comprobanteCambioSnapshotSchema,
  actaDevolucionSnapshotSchema,
]);

export type ActivoSnapshot = z.infer<typeof activoSnapshotSchema>;
export type ActivoDevueltoSnapshot = z.infer<typeof activoDevueltoSnapshotSchema>;
export type AnexoEntregaSnapshot = z.infer<typeof anexoEntregaSnapshotSchema>;
export type ComprobanteEntregaSnapshot = z.infer<typeof comprobanteEntregaSnapshotSchema>;
export type ComprobanteCambioSnapshot = z.infer<typeof comprobanteCambioSnapshotSchema>;
export type ActaDevolucionSnapshot = z.infer<typeof actaDevolucionSnapshotSchema>;
export type DocumentoSnapshot = z.infer<typeof documentoSnapshotSchema>;
export type TipoDocumentoSnapshot = DocumentoSnapshot['tipo'];

/**
 * Valida un snapshot leido de la base. Un documento cuyo snapshot no cumple el
 * contrato no se re-renderiza: se declara ilegible, porque emitir algo distinto
 * de lo que se firmo seria peor que no emitir nada.
 */
export function parseDocumentoSnapshot(value: unknown): DocumentoSnapshot {
  return documentoSnapshotSchema.parse(value);
}
