"use client";

import { Fragment, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { cn } from "@/shared/cn";
import { Pagination } from "@/shared/ui/Pagination";
import { COLUMNA_FIJA_CELDA, COLUMNA_FIJA_ENCABEZADO } from "@/shared/ui/tablaStyles";

/**
 * La tabla de todas las listas del sistema: encabezado, filas, "cargando", "sin
 * resultados", acciones fijas al borde derecho, fila que se expande, lista
 * compacta en celular y paginacion. Equipos, Personal, Asignaciones, Lineas,
 * Compras, Mantenciones, Solicitudes y las demas tenian cada una su copia.
 *
 * Cada pantalla solo dice que columnas tiene y que muestra cada celda; los
 * filtros y la carga de datos siguen siendo de la pantalla.
 */
export type ColumnaDatos<T> = {
  titulo: ReactNode;
  celda: (item: T) => ReactNode;
  /** Clases de la celda y del titulo (alineacion, ancho, ocultar en pantallas chicas...). */
  className?: string;
  /** Texto de la celda en una sola linea. */
  sinSalto?: boolean;
  /** Solo para lectores de pantalla (columna sin titulo visible). */
  tituloOculto?: boolean;
};

export type FilaExpandible<T> = {
  abierta: (item: T) => boolean;
  alternar: (item: T) => void;
  contenido: (item: T) => ReactNode;
  /** La pantalla pone su propio boton para abrir (sin la columna de la flecha). */
  botonPropio?: boolean;
};

type PaginacionTabla = Omit<ComponentProps<typeof Pagination>, "className">;

export function TablaDatos<T>({
  items,
  clave,
  columnas,
  acciones,
  tituloAcciones = "Acciones",
  tarjeta,
  cargando = false,
  vacio,
  compacta = false,
  alinearArriba = false,
  resaltada,
  claseFila,
  expandible,
  paginacion,
  sinMarco = false,
  className,
}: {
  items: T[];
  clave: (item: T) => string;
  columnas: ColumnaDatos<T>[];
  /** Botones de cada fila: columna fija al borde derecho (y junto a la tarjeta en celular). */
  acciones?: (item: T) => ReactNode;
  tituloAcciones?: string;
  /** Resumen de la fila en celular. Sin esto la tabla se desliza de lado en celular. */
  tarjeta?: (item: T) => ReactNode;
  cargando?: boolean;
  /** Lo que se dice cuando no hay filas. */
  vacio: ReactNode;
  /** Menos aire en las celdas, para tablas con muchas columnas. */
  compacta?: boolean;
  /** Celdas alineadas arriba (filas de varias lineas). */
  alinearArriba?: boolean;
  /** Fila con fondo distinto (inactiva, en edicion...). */
  resaltada?: (item: T) => boolean;
  /** Clases de la fila (ej. fondo rojo claro de lo vencido); manda sobre `resaltada`. */
  claseFila?: (item: T) => string | false | undefined;
  expandible?: FilaExpandible<T>;
  paginacion?: PaginacionTabla;
  /** Sin tarjeta propia: la tabla va dentro de otra tarjeta de la pantalla. */
  sinMarco?: boolean;
  className?: string;
}) {
  const relleno = compacta ? "px-3 py-3" : "px-6 py-4";
  const conFlecha = !!expandible && !expandible.botonPropio;
  const totalColumnas = columnas.length + (acciones ? 1 : 0) + (conFlecha ? 1 : 0);
  const enTabla = tarjeta ? "hidden md:table" : "";

  const mensaje = (contenido: ReactNode, alto = "py-10") => (
    <tr>
      <td colSpan={totalColumnas} className={cn("px-6 text-center text-fg-subtle", alto)}>
        {contenido}
      </td>
    </tr>
  );

  return (
    <div className={cn("overflow-hidden", !sinMarco && "card", className)}>
      <div className="overflow-x-auto">
        <table className={cn("min-w-full", enTabla, cargando && items.length > 0 && "opacity-60")}>
          <thead className="border-b border-line bg-surface-muted">
            <tr>
              {conFlecha && (
                <th className={cn("table-th w-12", compacta && "px-3")}>
                  <span className="sr-only">Expandir</span>
                </th>
              )}
              {columnas.map((c, i) => (
                <th key={i} className={cn("table-th", compacta && "px-3 whitespace-nowrap", c.className)}>
                  {c.tituloOculto ? <span className="sr-only">{c.titulo}</span> : c.titulo}
                </th>
              ))}
              {acciones && (
                <th className={cn("table-th text-right", compacta && "px-3", COLUMNA_FIJA_ENCABEZADO)}>{tituloAcciones}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface">
            {cargando && items.length === 0
              ? mensaje(<Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Cargando" />, "py-12")
              : items.length === 0
                ? mensaje(vacio, "py-12")
                : items.map((item) => {
                    const abierta = expandible?.abierta(item) ?? false;
                    const resalta = resaltada?.(item) ?? false;
                    return (
                      <Fragment key={clave(item)}>
                        <tr className={cn("group transition-colors hover:bg-surface-muted", resalta && "bg-surface-muted", claseFila?.(item))}>
                          {conFlecha && (
                            <td className={cn(relleno, "align-top")}>
                              <button
                                type="button"
                                onClick={() => expandible?.alternar(item)}
                                className="rounded p-1 hover:bg-surface-muted"
                                aria-label={abierta ? "Contraer" : "Expandir"}
                                aria-expanded={abierta}
                              >
                                {abierta ? <ChevronUp size={16} className="text-fg-subtle" /> : <ChevronDown size={16} className="text-fg-subtle" />}
                              </button>
                            </td>
                          )}
                          {columnas.map((c, i) => (
                            <td
                              key={i}
                              className={cn("text-sm", relleno, alinearArriba && "align-top", c.sinSalto && "whitespace-nowrap", c.className)}
                            >
                              {c.celda(item)}
                            </td>
                          ))}
                          {acciones && (
                            <td className={cn(relleno, "whitespace-nowrap text-right", alinearArriba && "align-top", COLUMNA_FIJA_CELDA, resalta && "bg-surface-muted")}>
                              <div className="flex justify-end gap-1">{acciones(item)}</div>
                            </td>
                          )}
                        </tr>
                        {abierta && expandible && (
                          <tr className="bg-surface-muted">
                            <td colSpan={totalColumnas} className="px-4 py-4">
                              {expandible.contenido(item)}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
          </tbody>
        </table>
      </div>

      {tarjeta && (
        <ul className="divide-y divide-line md:hidden">
          {cargando && items.length === 0 ? (
            <li className="px-4 py-10 text-center text-fg-subtle">
              <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Cargando" />
            </li>
          ) : items.length === 0 ? (
            <li className="px-4 py-10 text-center text-fg-subtle">{vacio}</li>
          ) : (
            items.map((item) => (
              <li
                key={clave(item)}
                className={cn("flex items-start justify-between gap-3 px-4 py-3 text-sm", resaltada?.(item) && "bg-surface-muted", claseFila?.(item))}
              >
                <div className="min-w-0 flex-1 space-y-1">{tarjeta(item)}</div>
                {acciones && <div className="flex shrink-0 gap-1">{acciones(item)}</div>}
              </li>
            ))
          )}
        </ul>
      )}

      {paginacion && paginacion.total > 0 && (
        <div className="border-t border-line bg-surface-muted px-6 py-4">
          <Pagination {...paginacion} />
        </div>
      )}
    </div>
  );
}
