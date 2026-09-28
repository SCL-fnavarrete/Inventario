import { z } from 'zod';
import { cantidad } from "./comunes";

export const CategoriaKitEnum = z.enum(['kit_bienvenida', 'epp']);

export const createKitItemSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(200),
  categoria: CategoriaKitEnum,
  cantidad: cantidad(0, 'La cantidad no puede ser negativa').default(0),
  // Umbral de "stock bajo" para la alerta del Dashboard (ver schema.prisma).
  stockMinimo: cantidad(0, 'El stock mínimo no puede ser negativo').default(5),
  // Solo tiene efecto si quien crea es admin -- el backend ignora este
  // campo para un tecnico y usa siempre su propia sede (sedeIdParaCrear).
  sedeId: z.string().uuid().optional().nullable(),
});

export const updateKitItemSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(200).optional(),
  categoria: CategoriaKitEnum.optional(),
  cantidad: cantidad(0, 'La cantidad no puede ser negativa').optional(),
  stockMinimo: cantidad(0, 'El stock mínimo no puede ser negativo').optional(),
});

// Entrega de Kit/EPP en Gestion TI: uno o mas articulos con la cantidad que
// se entrega de cada uno. La cantidad puede ser menor al stock (entrega
// parcial) pero nunca mayor -- eso se valida contra el stock real en el
// momento de ejecutar la entrega, no aqui.
export const entregarKitItemsSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        cantidad: cantidad(1, 'La cantidad debe ser al menos 1'),
      })
    )
    .min(1, 'Selecciona al menos un artículo'),
});

// Marca un articulo requerido (RequestKitItem) como "No aplica" -- la
// salida para cuando genuinamente no hay forma de entregarlo (sin stock,
// el empleado no lo necesita, etc.) y el ticket necesita poder cerrarse
// igual. requestKitItemId identifica la fila puntual dentro de la
// solicitud.
export const marcarKitItemNoAplicaSchema = z.object({
  requestKitItemId: z.string().uuid(),
  motivo: z.string().trim().min(1, 'Indica el motivo').max(500),
});

