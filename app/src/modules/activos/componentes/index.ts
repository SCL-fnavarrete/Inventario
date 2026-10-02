export { StatsBar } from '@/modules/activos/componentes/StatsBar';
export { CategoryTabs } from '@/modules/activos/componentes/CategoryTabs';
export { ActivosTabs } from '@/modules/activos/componentes/ActivosTabs';
export { ActiveFilters } from '@/modules/activos/componentes/ActiveFilters';
export { AssetCard } from '@/modules/activos/componentes/AssetCard';
export { KanbanBoard } from '@/modules/activos/componentes/KanbanBoard';
// ReasignarActivoForm ya no se exporta: quedo huerfano, nada lo importa
// fuera de este archivo.
export {
  ACTIVO_FORM_VACIO,
  ActivoForm,
  payloadActivo,
  valoresDesdeActivo,
  type ActivoFormValues,
} from '@/modules/activos/componentes/ActivoForm';
export {
  AssetConditionBadge,
  AssetStatusBadge,
  getStatusLabel,
} from '@/modules/activos/componentes/BadgesActivo';
export { EliminarActivo } from '@/modules/activos/componentes/EliminarActivo';
export { CategoriasCatalogo } from '@/modules/activos/componentes/CategoriasCatalogo';
export { CategoryIcon, iconoDeCategoria } from '@/modules/activos/componentes/CategoryIcon';
export {
  FiltrosDatoActivo,
  textoFiltroDato,
  useOpcionesFiltroDato,
  type OpcionesFiltroDato,
} from '@/modules/activos/componentes/FiltrosDatoActivo';
export {
  OpcionesCatalogo,
  type TextosCatalogo,
} from '@/modules/activos/componentes/OpcionesCatalogo';
export { SelectCondicionCargador } from '@/modules/activos/componentes/SelectCondicionCargador';
