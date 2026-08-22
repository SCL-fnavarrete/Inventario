import type { TipoDevolucion } from '@prisma/client';

export type AssetCategorySpecialFields = {
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  imei: string | null;
  numeroTelefono: string | null;
  pulgadas: number | null;
  sistemaOperativo: string | null;
  microsoft365: boolean;
};

/**
 * Mantiene activos e importación alineados con el contrato estable de la categoría.
 * El nombre se conserva solo para mostrarlo al usuario, nunca para decidir
 * qué especificaciones pertenecen al activo.
 */
export function getCategorySpecialFields(
  tipoDevolucion: TipoDevolucion,
  values: AssetCategorySpecialFields
): AssetCategorySpecialFields {
  return {
    procesador: tipoDevolucion === 'notebook' ? values.procesador : null,
    ram: tipoDevolucion === 'notebook' ? values.ram : null,
    discoDuro: tipoDevolucion === 'notebook' ? values.discoDuro : null,
    imei: tipoDevolucion === 'celular' ? values.imei : null,
    numeroTelefono: tipoDevolucion === 'celular' ? values.numeroTelefono : null,
    pulgadas: tipoDevolucion === 'monitor' ? values.pulgadas : null,
    sistemaOperativo: tipoDevolucion === 'notebook' ? values.sistemaOperativo : null,
    microsoft365: tipoDevolucion === 'notebook' ? values.microsoft365 : false,
  };
}
