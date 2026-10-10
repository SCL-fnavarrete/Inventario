import { z } from 'zod';
import { textoLibre } from "@/shared/validaciones/comunes";
import { estadoActivoEnum } from '@/modules/activos/validaciones';

// Transiciones válidas del ciclo de vida de activos
export const assetTransitionSchema = z.object({
  estadoNuevo: estadoActivoEnum,
  motivo: textoLibre(1000),
});

// Resultado de cierre de una mantención; reutilizado en
// completeMaintenanceSchema (modules/mantenciones/validaciones.ts).
export const resultadoMantencionEnum = z.enum(['reparado', 'no_reparable', 'pendiente_repuestos']);

// Tipos inferidos
export type AssetTransitionInput = z.infer<typeof assetTransitionSchema>;
export type ResultadoMantencion = z.infer<typeof resultadoMantencionEnum>;
