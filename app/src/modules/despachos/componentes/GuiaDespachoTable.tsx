"use client";

import Link from "next/link";
import { FileText, Eye } from "lucide-react";
import { cn } from "@/shared/cn";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import {
  ESTADO_GUIA_LABELS,
  ESTADO_GUIA_COLORS,
  type DispatchGuideListItem,
} from "@/modules/despachos/tipos";
import { formatearFechaCorta } from "@/shared/utilidades/fechas";

interface GuiaDespachoTableProps {
  guides: DispatchGuideListItem[];
  loading?: boolean;
}

// En celular se ven solo el N° y el Estado; el resto va bajo el numero
// (mismo patron que Solicitudes). Tocar el numero abre el detalle.
const soloEscritorio = "hidden md:table-cell";

/** Qué lleva el despacho, sin contar en cero: "2 equipos", "1 artículo de Kit/EPP". */
function contenido(g: { _count: { items: number; kitItems: number } }) {
  const { items, kitItems } = g._count;
  return [
    items > 0 && `${items} ${items === 1 ? "equipo" : "equipos"}`,
    kitItems > 0 && `${kitItems} ${kitItems === 1 ? "artículo" : "artículos"} de Kit/EPP`,
  ].filter(Boolean) as string[];
}

export function GuiaDespachoTable({ guides, loading }: GuiaDespachoTableProps) {
  return (
    <TablaDatos
      items={guides}
      clave={(g) => g.id}
      cargando={loading}
      vacio={
        <>
          <FileText className="mx-auto mb-4 h-12 w-12 text-gray-300" />
          <p>No hay despachos</p>
        </>
      }
      columnas={[
        {
          titulo: "N° Despacho",
          className: "px-4 py-3 md:px-6 md:py-4 md:whitespace-nowrap",
          celda: (g) => (
            <>
              <Link href={`/despachos/${g.id}`} className="font-medium text-primary-700 hover:text-primary-900">
                {g.numero}
              </Link>
              <div className="mt-1 text-sm text-fg-muted md:hidden">
                {g.sede?.nombre || "-"} → {g.sedeDestino?.nombre || "-"}
              </div>
              <div className="text-xs text-fg-subtle md:hidden">
                {formatearFechaCorta(g.fechaDespacho)} · {contenido(g).join(" + ")}
              </div>
            </>
          ),
        },
        { titulo: "Fecha", sinSalto: true, className: cn(soloEscritorio, "text-fg-subtle"), celda: (g) => formatearFechaCorta(g.fechaDespacho) },
        { titulo: "OT Chilexpress", sinSalto: true, className: cn(soloEscritorio, "font-mono text-fg"), celda: (g) => g.otChilexpress },
        { titulo: "Sede origen", sinSalto: true, className: cn(soloEscritorio, "text-fg"), celda: (g) => g.sede?.nombre || "-" },
        { titulo: "Sede destino", sinSalto: true, className: cn(soloEscritorio, "text-fg"), celda: (g) => g.sedeDestino?.nombre || "-" },
        { titulo: "Receptor", sinSalto: true, className: cn(soloEscritorio, "text-fg"), celda: (g) => g.receptorNombre },
        {
          titulo: "Contenido",
          sinSalto: true,
          className: cn(soloEscritorio, "text-fg-subtle"),
          celda: (g) => contenido(g).map((c) => <span key={c} className="block">{c}</span>),
        },
        {
          titulo: "Estado",
          sinSalto: true,
          className: "px-4 py-3 align-top md:px-6 md:py-4 md:align-middle",
          celda: (g) => (
            <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-medium", ESTADO_GUIA_COLORS[g.estado])}>
              {ESTADO_GUIA_LABELS[g.estado]}
            </span>
          ),
        },
        {
          titulo: "Acciones",
          sinSalto: true,
          className: cn(soloEscritorio, "text-right font-medium"),
          celda: (g) => (
            <div className="flex items-center justify-end gap-2">
              <Link
                href={`/despachos/${g.id}`}
                className="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-primary-50 hover:text-primary-700"
                title="Ver detalle"
                aria-label="Ver detalle"
              >
                <Eye size={18} />
              </Link>
            </div>
          ),
        },
      ]}
    />
  );
}
