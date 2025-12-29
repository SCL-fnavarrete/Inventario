"use client";

import {
  forwardRef,
  useEffect,
  useRef,
  useCallback,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  children: ReactNode;
}

const sizeStyles: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]",
};

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      isOpen,
      onClose,
      title,
      description,
      footer,
      size = "md",
      closeOnOverlayClick = true,
      closeOnEscape = true,
      showCloseButton = true,
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);

    // Handle escape key
    const handleKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if (closeOnEscape && event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      },
      [closeOnEscape, onClose]
    );

    // Focus trap
    const handleTabKey = useCallback((event: KeyboardEvent) => {
      if (event.key !== "Tab" || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }, []);

    useEffect(() => {
      if (isOpen) {
        // Store current active element
        previousActiveElement.current = document.activeElement as HTMLElement;

        // Prevent body scroll
        document.body.style.overflow = "hidden";

        // Add event listeners
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("keydown", handleTabKey);

        // Focus first focusable element in modal
        requestAnimationFrame(() => {
          const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          firstFocusable?.focus();
        });
      }

      return () => {
        document.body.style.overflow = "";
        document.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("keydown", handleTabKey);

        // Return focus to previous element
        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      };
    }, [isOpen, handleKeyDown, handleTabKey]);

    const handleOverlayClick = (event: React.MouseEvent) => {
      if (closeOnOverlayClick && event.target === event.currentTarget) {
        onClose();
      }
    };

    if (!isOpen) return null;

    const modalContent = (
      <div
        className={`
          fixed inset-0 z-50
          flex items-center justify-center
          p-4
        `}
        aria-modal="true"
        role="dialog"
        aria-labelledby={title ? "modal-title" : undefined}
        aria-describedby={description ? "modal-description" : undefined}
      >
        {/* Overlay */}
        <div
          className={`
            fixed inset-0
            bg-black/50
            backdrop-blur-sm
            animate-[fadeIn_150ms_ease-out]
            motion-reduce:animate-none
          `}
          onClick={handleOverlayClick}
          aria-hidden="true"
        />

        {/* Modal panel */}
        <div
          ref={(node) => {
            modalRef.current = node;
            if (typeof ref === "function") {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          className={`
            relative
            w-full
            ${sizeStyles[size]}
            bg-white
            rounded-xl
            shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]
            animate-[modalIn_200ms_ease-out]
            motion-reduce:animate-none
            overflow-hidden
            ${className}
          `}
          {...props}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
              <div className="flex-1 min-w-0">
                {title && (
                  <h2
                    id="modal-title"
                    className="text-lg font-semibold text-gray-900 leading-tight"
                  >
                    {title}
                  </h2>
                )}
                {description && (
                  <p
                    id="modal-description"
                    className="mt-1 text-sm text-gray-500"
                  >
                    {description}
                  </p>
                )}
              </div>

              {showCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className={`
                    flex-shrink-0
                    p-1.5
                    rounded-lg
                    text-gray-400
                    hover:text-gray-600
                    hover:bg-gray-100
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-blue-500
                    focus-visible:ring-offset-2
                    transition-colors duration-150
                    motion-reduce:transition-none
                  `}
                  aria-label="Cerrar modal"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className="px-6 pb-6 max-h-[60vh] overflow-y-auto">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
              {footer}
            </div>
          )}
        </div>
      </div>
    );

    // Use portal to render at document body
    if (typeof document !== "undefined") {
      return createPortal(modalContent, document.body);
    }

    return null;
  }
);

Modal.displayName = "Modal";

export default Modal;
