"use client";

import { type ReactNode } from "react";
import { AlertTriangle, Trash2, AlertCircle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

type ConfirmDialogVariant = "danger" | "warning" | "info";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  loading?: boolean;
}

const variantConfig: Record<
  ConfirmDialogVariant,
  {
    icon: typeof AlertTriangle;
    iconColor: string;
    iconBg: string;
    buttonVariant: "danger" | "primary" | "secondary";
  }
> = {
  danger: {
    icon: Trash2,
    iconColor: "text-red-600",
    iconBg: "bg-red-100",
    buttonVariant: "danger",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-amber-600",
    iconBg: "bg-amber-100",
    buttonVariant: "primary",
  },
  info: {
    icon: AlertCircle,
    iconColor: "text-blue-600",
    iconBg: "bg-blue-100",
    buttonVariant: "primary",
  },
};

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  loading = false,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleConfirm = async () => {
    await onConfirm();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      closeOnOverlayClick={!loading}
      closeOnEscape={!loading}
    >
      <div className="flex flex-col items-center text-center">
        {/* Icon */}
        <div
          className={`
            flex items-center justify-center
            w-14 h-14
            rounded-full
            mb-4
            ${config.iconBg}
          `}
        >
          <Icon className={`w-7 h-7 ${config.iconColor}`} />
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>

        {/* Message */}
        <div className="text-sm text-gray-600 mb-6">{message}</div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3 w-full">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={config.buttonVariant}
            onClick={handleConfirm}
            loading={loading}
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Componentes especializados para casos comunes

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  entityName: string;
  entityIdentifier?: string;
  loading?: boolean;
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  entityName,
  entityIdentifier,
  loading = false,
}: DeleteConfirmDialogProps) {
  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      variant="danger"
      title={`Eliminar ${entityName}`}
      message={
        <>
          ¿Estás seguro de que deseas eliminar{" "}
          {entityIdentifier ? (
            <>
              <strong>{entityIdentifier}</strong>
            </>
          ) : (
            `este ${entityName}`
          )}
          ? Esta acción no se puede deshacer.
        </>
      }
      confirmLabel="Eliminar"
      cancelLabel="Cancelar"
      loading={loading}
    />
  );
}

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDiscard: () => void;
  onSave?: () => void | Promise<void>;
  loading?: boolean;
}

export function UnsavedChangesDialog({
  isOpen,
  onClose,
  onDiscard,
  onSave,
  loading = false,
}: UnsavedChangesDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      showCloseButton={false}
      closeOnOverlayClick={!loading}
      closeOnEscape={!loading}
    >
      <div className="flex flex-col items-center text-center">
        <div
          className={`
            flex items-center justify-center
            w-14 h-14
            rounded-full
            mb-4
            bg-amber-100
          `}
        >
          <AlertTriangle className="w-7 h-7 text-amber-600" />
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Cambios sin guardar
        </h3>

        <p className="text-sm text-gray-600 mb-6">
          Tienes cambios sin guardar. ¿Qué deseas hacer?
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            Seguir editando
          </Button>
          <Button
            variant="ghost"
            onClick={onDiscard}
            disabled={loading}
            className="w-full sm:w-auto text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            Descartar
          </Button>
          {onSave && (
            <Button
              variant="primary"
              onClick={onSave}
              loading={loading}
              className="w-full sm:w-auto"
            >
              Guardar
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
