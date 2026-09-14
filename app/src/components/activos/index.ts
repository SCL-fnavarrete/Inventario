export { StatsBar } from "./StatsBar";
export { CategoryTabs } from "./CategoryTabs";
export { ActivosTabs } from "./ActivosTabs";
export { ActiveFilters } from "./ActiveFilters";
export { AssetCard } from "./AssetCard";
export { KanbanBoard } from "./KanbanBoard";
export { AsignarActivoForm } from "./AsignarActivoForm";
export { AsignacionesTable } from "./AsignacionesTable";
// ReasignarActivoForm ya no se exporta (11-sep-2026, SPEC 2.18): quedo
// huerfano desde la v1.17 (nada lo importa fuera de este archivo, se
// confirmo de nuevo antes de este cambio). El archivo en si
// (ReasignarActivoForm.tsx), la pagina /activos/:id/reasignar y el
// endpoint PUT /api/activos/:id/reasignar siguen sin poder borrarse este
// dia por el mismo problema del workspace del dispositivo -- ver SPEC 2.18.
