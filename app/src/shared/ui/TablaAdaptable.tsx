import type { ReactNode } from "react";
import { cn } from "@/shared/cn";

/**
 * Lista que en escritorio es una tabla y en celular una fila compacta con
 * sus botones (SPEC 2.112.9). Antes Usuarios, Sedes y Categorias tenian
 * cada una su tabla, que en celular se cortaba y dejaba los botones fuera
 * de la pantalla.
 */
export type ColumnaTabla<T> = {
  titulo: string;
  celda: (item: T) => ReactNode;
  /** Clases de la celda (alineacion, ocultar en pantallas medianas...). */
  className?: string;
};

export function TablaAdaptable<T>({
  items,
  clave,
  columnas,
  acciones,
  tarjeta,
  vacio,
  resaltada,
}: {
  items: T[];
  clave: (item: T) => string;
  columnas: ColumnaTabla<T>[];
  /** Botones de cada fila (misma pieza en escritorio y celular). */
  acciones?: (item: T) => ReactNode;
  /** Resumen de la fila en celular. */
  tarjeta: (item: T) => ReactNode;
  vacio: string;
  /** Fila con fondo distinto (inactiva, en edicion...). */
  resaltada?: (item: T) => boolean;
}) {
  if (items.length === 0) {
    return <p className="card px-6 py-8 text-center text-fg-subtle">{vacio}</p>;
  }
  return (
    <div className="card overflow-hidden">
      <table className="hidden min-w-full divide-y divide-line md:table">
        <thead className="bg-surface-muted">
          <tr>
            {columnas.map((c) => (
              <th key={c.titulo} className={cn("table-th", c.className)}>
                {c.titulo}
              </th>
            ))}
            {acciones && <th className="table-th text-right">Acciones</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-surface">
          {items.map((item) => (
            <tr key={clave(item)} className={cn(resaltada?.(item) && "bg-surface-muted")}>
              {columnas.map((c) => (
                <td key={c.titulo} className={cn("px-6 py-4 text-sm", c.className)}>
                  {c.celda(item)}
                </td>
              ))}
              {acciones && (
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">{acciones(item)}</div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y divide-line md:hidden">
        {items.map((item) => (
          <li
            key={clave(item)}
            className={cn("flex items-start justify-between gap-3 px-4 py-3 text-sm", resaltada?.(item) && "bg-surface-muted")}
          >
            <div className="min-w-0 flex-1 space-y-1">{tarjeta(item)}</div>
            {acciones && <div className="flex shrink-0 gap-1">{acciones(item)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
