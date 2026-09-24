"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { TONO_ACENTO, type Tono } from "@/lib/constants/tonos";

// Types
type ToastVariant = "success" | "error" | "warning" | "info";
type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
}

// Context
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// Hook
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// El valor nunca cambia despues de la hidratacion, asi que no hay a que suscribirse.
const subscribeNoop = () => () => {};

// Provider
interface ToastProviderProps {
  children: ReactNode;
  position?: ToastPosition;
  maxToasts?: number;
}

export function ToastProvider({
  children,
  position = "top-right",
  maxToasts = 5,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // El portal solo puede montarse en el cliente. `useSyncExternalStore` da esa
  // senal sin un setState dentro de un efecto, que provoca un render en cascada.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newToast: Toast = { ...toast, id };

      setToasts((prev) => {
        const updated = [...prev, newToast];
        // Limit max toasts
        return updated.slice(-maxToasts);
      });

      // Auto dismiss
      const duration = toast.duration ?? 5000;
      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }

      return id;
    },
    [maxToasts, removeToast]
  );

  const success = useCallback(
    (title: string, description?: string) =>
      addToast({ variant: "success", title, description }),
    [addToast]
  );

  const error = useCallback(
    (title: string, description?: string) =>
      addToast({ variant: "error", title, description, duration: 8000 }),
    [addToast]
  );

  const warning = useCallback(
    (title: string, description?: string) =>
      addToast({ variant: "warning", title, description }),
    [addToast]
  );

  const info = useCallback(
    (title: string, description?: string) =>
      addToast({ variant: "info", title, description }),
    [addToast]
  );

  const positionStyles: Record<ToastPosition, string> = {
    // top-20: bajo la barra de navegacion (h-16), que queda fija arriba.
    "top-right": "top-20 right-4",
    "top-left": "top-20 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "top-center": "top-20 left-1/2 -translate-x-1/2",
    "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  };

  return (
    <ToastContext.Provider
      value={{ toasts, addToast, removeToast, success, error, warning, info }}
    >
      {children}
      {mounted &&
        createPortal(
          <div
            className={`
              fixed z-[100]
              flex flex-col gap-2
              pointer-events-none
              ${positionStyles[position]}
            `}
            aria-live="polite"
            aria-label="Notificaciones"
          >
            {toasts.map((toast) => (
              <ToastItem
                key={toast.id}
                toast={toast}
                onDismiss={() => removeToast(toast.id)}
              />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

// Toast Item Component
interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

// Superficie opaca (card-feature) teñida con el tono: un fondo bg-*-50 se
// vuelve translucido en modo oscuro y el toast dejaria ver lo de atras.
const variantStyles: Record<ToastVariant, { tono: Tono; icon: string }> = {
  success: { tono: "success", icon: "text-emerald-500" },
  error: { tono: "danger", icon: "text-red-500" },
  warning: { tono: "warning", icon: "text-amber-500" },
  info: { tono: "primary", icon: "text-primary-500" },
};

const variantIcons: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const styles = variantStyles[toast.variant];
  const Icon = variantIcons[toast.variant];

  return (
    <div
      className={`
        pointer-events-auto
        w-80 max-w-[calc(100vw-2rem)]
        flex items-start gap-3
        px-4 py-3
        card-feature
        shadow-card-hover
        ${TONO_ACENTO[styles.tono]}
        animate-toast-in
        motion-reduce:animate-none
      `}
      role="alert"
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles.icon}`} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-fg">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-sm text-fg-muted">{toast.description}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className={`
          flex-shrink-0
          p-1
          rounded-lg
          text-fg-subtle
          hover:text-fg-muted
          hover:bg-black/5
          focus:outline-none
          focus-visible:ring-2
          focus-visible:ring-gray-400
          transition-colors duration-150
          motion-reduce:transition-none
        `}
        aria-label="Cerrar notificación"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default ToastProvider;
