import type { TipoDevolucion } from '@prisma/client';

export type AssetCategorySpecialFields = {
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  microsoft365: boolean;
  antivirus: string | null;
  nombreEquipo: string | null;
  imei: string | null;
  numeroTelefono: string | null;
  numeroActivacion: string | null;
  tipoPlan: string | null;
  operador: string | null;
  tieneCargador: boolean;
  pulgadas: number | null;
};

export const ASSET_CATEGORY_SPECIAL_FIELDS = [
  'procesador',
  'ram',
  'discoDuro',
  'sistemaOperativo',
  'microsoft365',
  'antivirus',
  'nombreEquipo',
  'imei',
  'numeroTelefono',
  'numeroActivacion',
  'tipoPlan',
  'operador',
  'tieneCargador',
  'pulgadas',
] as const satisfies ReadonlyArray<keyof AssetCategorySpecialFields>;

export function parseCategoryBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === 'boolean') return value;

  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return defaultValue;

  return ['si', 'sí', 'yes', 'true', '1'].includes(normalized);
}

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
    sistemaOperativo: tipoDevolucion === 'notebook' ? values.sistemaOperativo : null,
    microsoft365: tipoDevolucion === 'notebook' ? values.microsoft365 : false,
    antivirus: tipoDevolucion === 'notebook' ? values.antivirus : null,
    nombreEquipo: tipoDevolucion === 'notebook' ? values.nombreEquipo : null,
    imei: tipoDevolucion === 'celular' ? values.imei : null,
    numeroTelefono: tipoDevolucion === 'celular' ? values.numeroTelefono : null,
    numeroActivacion: tipoDevolucion === 'celular' ? values.numeroActivacion : null,
    tipoPlan: tipoDevolucion === 'celular' ? values.tipoPlan : null,
    operador: tipoDevolucion === 'celular' ? values.operador : null,
    tieneCargador: tipoDevolucion === 'celular' ? values.tieneCargador : false,
    pulgadas: tipoDevolucion === 'monitor' ? values.pulgadas : null,
  };
}
