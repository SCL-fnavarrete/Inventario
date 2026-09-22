import { z } from 'zod';
import { estadoActivoEnum } from './asset';

// Transiciones válidas del ciclo de vida de activos
export const assetTransitionSchema = z.object({
  estadoNuevo: estadoActivoEnum,
  motivo: z.string().optional().nullable(),
});

// Proceso de baja de un activo
export const motivoBajaEnum = z.enum([
  'obsolescencia',
  'falla_irreparable',
  'robo',
  'extravio',
  'otro',
]);

export const condicionFinalBajaEnum = z.enum(['danado', 'usado']);

export const assetBajaSchema = z
  .object({
    motivo: motivoBajaEnum,
    motivoDetalle: z.string().max(500).optional().nullable(),
    condicionFinal: condicionFinalBajaEnum,
  })
  .refine((data) => data.motivo !== 'otro' || (data.motivoDetalle && data.motivoDetalle.length > 0), {
    message: 'Se requiere detalle cuando el motivo es "otro"',
    path: ['motivoDetalle'],
  });

// Proceso de venta de un activo
export const assetVentaSchema = z.object({
  comprador: z.string().min(1, 'El comprador es requerido').max(200),
  monto: z.number().positive('El monto debe ser positivo'),
  moneda: z.enum(['CLP', 'USD']).default('CLP'),
  fechaVenta: z.string().min(1, 'La fecha de venta es requerida').transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error('Fecha de venta inválida');
    return date;
  }),
});

// Resultado de cierre de una mantención; reutilizado en
// completeMaintenanceSchema (lib/validations/maintenance.ts).
export const resultadoMantencionEnum = z.enum(['reparado', 'no_reparable', 'pendiente_repuestos']);

// Reasignación de un activo a otro empleado
export const assetReassignmentSchema = z.object({
  assignmentId: z.string().uuid('ID de asignación inválido'),
  newEmployeeId: z.string().uuid('ID de empleado inválido'),
  estadoDevolucion: z.enum(['ok', 'incompleto']),
  motivoReasignacion: z.string().min(1, 'El motivo de reasignación es requerido').max(500),
  fechaReasignacion: z.string().min(1).transform((val) => {
    const date = new Date(val);
    if (isNaN(date.getTime())) throw new Error('Fecha inválida');
    return date;
  }),
  lugarEntrega: z.string().max(100).optional().nullable(),
  entregadoPor: z.string().max(100).optional().nullable(),
});

// Tipos inferidos
export type AssetTransitionInput = z.infer<typeof assetTransitionSchema>;
export type AssetBajaInput = z.infer<typeof assetBajaSchema>;
export type AssetVentaInput = z.infer<typeof assetVentaSchema>;
export type AssetReassignmentInput = z.infer<typeof assetReassignmentSchema>;
export type MotivoBaja = z.infer<typeof motivoBajaEnum>;
export type ResultadoMantencion = z.infer<typeof resultadoMantencionEnum>;
