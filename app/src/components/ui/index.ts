// UI Component Library - Inventario IT
// Sistema de componentes accesibles y reutilizables

// Button
export { Button } from "./Button";
export type { default as ButtonDefault } from "./Button";

// Card
export { Card } from "./Card";
export type { default as CardDefault } from "./Card";

// Badge
export { Badge, AssetStatusBadge, getStatusLabel } from "./Badge";
export type { default as BadgeDefault } from "./Badge";

// Modal
export { Modal } from "./Modal";
export type { default as ModalDefault } from "./Modal";

// Toast
export { ToastProvider, useToast } from "./Toast";
export type { default as ToastDefault } from "./Toast";

// EmptyState
export {
  EmptyState,
  EmptySearchState,
  EmptyAssetsState,
  EmptyEmployeesState,
  EmptyTableState,
} from "./EmptyState";
export type { default as EmptyStateDefault } from "./EmptyState";

// Skeleton
export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonTableRow,
  SkeletonTable,
} from "./Skeleton";
export type { default as SkeletonDefault } from "./Skeleton";

// ConfirmDialog
export {
  ConfirmDialog,
  DeleteConfirmDialog,
  UnsavedChangesDialog,
} from "./ConfirmDialog";
export type { default as ConfirmDialogDefault } from "./ConfirmDialog";
