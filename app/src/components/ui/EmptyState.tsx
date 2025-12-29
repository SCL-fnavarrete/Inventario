"use client";

import { type ReactNode, type HTMLAttributes } from "react";
import { Package, Search, Users, FileX, FolderOpen } from "lucide-react";
import { Button } from "./Button";

type EmptyStatePreset = "default" | "search" | "assets" | "employees" | "files";

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  preset?: EmptyStatePreset;
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: "primary" | "secondary" | "outline";
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

const presetIcons: Record<EmptyStatePreset, typeof Package> = {
  default: FolderOpen,
  search: Search,
  assets: Package,
  employees: Users,
  files: FileX,
};

export function EmptyState({
  preset = "default",
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionVariant = "primary",
  secondaryActionLabel,
  onSecondaryAction,
  className = "",
  ...props
}: EmptyStateProps) {
  const PresetIcon = presetIcons[preset];
  const IconComponent = icon || (
    <PresetIcon className="w-12 h-12 text-gray-300" strokeWidth={1.5} />
  );

  return (
    <div
      className={`
        flex flex-col items-center justify-center
        py-12 px-6
        text-center
        ${className}
      `}
      {...props}
    >
      {/* Icon container with subtle background */}
      <div
        className={`
          flex items-center justify-center
          w-20 h-20
          rounded-2xl
          bg-gradient-to-br from-gray-50 to-gray-100
          border border-gray-100
          mb-5
        `}
      >
        {IconComponent}
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>

      {/* Description */}
      {description && (
        <p className="text-sm text-gray-500 max-w-sm mb-6">{description}</p>
      )}

      {/* Actions */}
      {(actionLabel || secondaryActionLabel) && (
        <div className="flex items-center gap-3">
          {secondaryActionLabel && onSecondaryAction && (
            <Button variant="outline" size="sm" onClick={onSecondaryAction}>
              {secondaryActionLabel}
            </Button>
          )}
          {actionLabel && onAction && (
            <Button variant={actionVariant} size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Componentes especializados para casos comunes

export function EmptySearchState({
  query,
  onClear,
  ...props
}: Omit<EmptyStateProps, "preset" | "title" | "description"> & {
  query?: string;
  onClear?: () => void;
}) {
  return (
    <EmptyState
      preset="search"
      title="Sin resultados"
      description={
        query
          ? `No se encontraron resultados para "${query}". Intenta con otros términos de búsqueda.`
          : "No se encontraron resultados. Intenta con otros términos de búsqueda."
      }
      actionLabel={onClear ? "Limpiar búsqueda" : undefined}
      onAction={onClear}
      actionVariant="outline"
      {...props}
    />
  );
}

export function EmptyAssetsState({
  onAdd,
  ...props
}: Omit<EmptyStateProps, "preset" | "title" | "description"> & {
  onAdd?: () => void;
}) {
  return (
    <EmptyState
      preset="assets"
      title="Sin activos"
      description="No hay activos registrados en el sistema. Comienza agregando tu primer activo."
      actionLabel={onAdd ? "Agregar activo" : undefined}
      onAction={onAdd}
      {...props}
    />
  );
}

export function EmptyEmployeesState({
  onAdd,
  ...props
}: Omit<EmptyStateProps, "preset" | "title" | "description"> & {
  onAdd?: () => void;
}) {
  return (
    <EmptyState
      preset="employees"
      title="Sin empleados"
      description="No hay empleados registrados en el sistema. Comienza agregando tu primer empleado."
      actionLabel={onAdd ? "Agregar empleado" : undefined}
      onAction={onAdd}
      {...props}
    />
  );
}

export function EmptyTableState({
  entityName = "registros",
  onAdd,
  ...props
}: Omit<EmptyStateProps, "preset" | "title" | "description"> & {
  entityName?: string;
  onAdd?: () => void;
}) {
  return (
    <EmptyState
      preset="default"
      title={`Sin ${entityName}`}
      description={`No hay ${entityName} para mostrar.`}
      actionLabel={onAdd ? `Agregar ${entityName}` : undefined}
      onAction={onAdd}
      {...props}
    />
  );
}

export default EmptyState;
