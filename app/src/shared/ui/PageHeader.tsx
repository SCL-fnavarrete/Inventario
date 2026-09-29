import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Botones o links de accion; quedan a la derecha y bajan en mobile. */
  actions?: ReactNode;
  /** Muestra la flecha "volver" hacia esta ruta. */
  backHref?: string;
  /** Icono o avatar a la izquierda del titulo (ej. icono de categoria). */
  leading?: ReactNode;
}

/**
 * Cabecera estandar de pagina: titulo, descripcion y acciones. Unas 40
 * paginas repetian el mismo bloque con pequenas variaciones de margen; este
 * componente fija una sola jerarquia tipografica para todo el sistema.
 * Es server-compatible (sin estado) para usarse tambien en paginas async.
 */
export function PageHeader({ title, description, actions, backHref, leading }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        {backHref && (
          <Link
            href={backHref}
            className="rounded-control p-2 text-fg-subtle transition-colors hover:bg-gray-100 hover:text-fg"
            aria-label="Volver"
          >
            <ArrowLeft size={22} />
          </Link>
        )}
        {leading}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
          {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export default PageHeader;
