import { z } from 'zod';
import { textoLibre } from "./comunes";
import { estadoActivoEnum } from './asset';

// Transiciones válidas del ciclo de vida de activos
export const assetTransitionSchema = z.object({
  estadoNuevo: estadoActivoEnum,
  motivo: textoLibre(1000),
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

// Tipos inferidos
export type AssetTransitionInput = z.infer<typeof assetTransitionSchema>;
export type AssetVentaInput = z.infer<typeof assetVentaSchema>;
export type ResultadoMantencion = z.infer<typeof resultadoMantencionEnum>;
