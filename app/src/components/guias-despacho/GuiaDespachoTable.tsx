"use client";

import Link from "next/link";
import { FileText, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ESTADO_GUIA_LABELS,
  ESTADO_GUIA_COLORS,
  type DispatchGuideListItem,
} from "@/types/guia-despacho";
import { formatearFechaCorta } from "@/lib/utils/fechas";

interface GuiaDespachoTableProps {
  guides: DispatchGuideListItem[];
  loading?: boolean;
}

// En celular se ven solo el N° y el Estado; el resto va bajo el numero
// (mismo patron que Solicitudes). Tocar el numero abre el detalle.
const soloEscritorio = "hidden md:table-cell";

export function GuiaDespachoTable({ guides, loading }: GuiaDespachoTableProps) {
  if (loading) {
    return (
      <div className="card overflow-hidden">
        <div className="p-8 text-center text-fg-subtle">
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-8 w-8 bg-gray-200 rounded-full mb-4"></div>
            <div className="h-4 w-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (guides.length === 0) {
    return (
      <div className="card overflow-hidden">
        <div className="p-8 text-center text-fg-subtle">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p>No hay despachos</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-surface-muted">
            <tr>
              <th className="table-th">N° Despacho</th>
              <th className={cn("table-th", soloEscritorio)}>Fecha</th>
              <th className={cn("table-th", soloEscritorio)}>OT Chilexpress</th>
              <th className={cn("table-th", soloEscritorio)}>Sede origen</th>
              <th className={cn("table-th", soloEscritorio)}>Sede destino</th>
              <th className={cn("table-th", soloEscritorio)}>Receptor</th>
              <th className={cn("table-th", soloEscritorio)}>Items</th>
              <th className="table-th">Estado</th>
              <th className={cn("table-th text-right", soloEscritorio)}>Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-line">
            {guides.map((guide) => (
              <tr key={guide.id} className="hover:bg-surface-muted">
                <td className="px-4 py-3 md:px-6 md:py-4 md:whitespace-nowrap">
                  <Link
                    href={`/despachos/${guide.id}`}
                    className="text-primary-700 hover:text-primary-900 font-medium"
                  >
                    {guide.numero}
                  </Link>
                  <div className="md:hidden mt-1 text-sm text-fg-muted">
                    {guide.sede?.nombre || "-"} → {guide.sedeDestino?.nombre || "-"}
                  </div>
                  <div className="md:hidden text-xs text-fg-subtle">
                    {formatearFechaCorta(guide.fechaDespacho)} · {guide._count.items}{" "}
                    {guide._count.items === 1 ? "equipo" : "equipos"}
                  </div>
                </td>
                <td className={cn("px-6 py-4 whitespace-nowrap text-sm text-fg-subtle", soloEscritorio)}>
                  {formatearFechaCorta(guide.fechaDespacho)}
                </td>
                <td className={cn("px-6 py-4 whitespace-nowrap text-sm text-fg font-mono", soloEscritorio)}>
                  {guide.otChilexpress}
                </td>
                <td className={cn("px-6 py-4 whitespace-nowrap text-sm text-fg", soloEscritorio)}>
                  {guide.sede?.nombre || "-"}
                </td>
                <td className={cn("px-6 py-4 whitespace-nowrap text-sm text-fg", soloEscritorio)}>
                  {guide.sedeDestino?.nombre || "-"}
                </td>
                <td className={cn("px-6 py-4 whitespace-nowrap text-sm text-fg", soloEscritorio)}>
                  {guide.receptorNombre}
                </td>
                <td className={cn("px-6 py-4 whitespace-nowrap text-sm text-fg-subtle", soloEscritorio)}>
                  {guide._count.items}
                </td>
                <td className="px-4 py-3 md:px-6 md:py-4 whitespace-nowrap align-top md:align-middle">
                  <span
                    className={cn(
                      "inline-flex px-2 py-1 text-xs font-medium rounded-full",
                      ESTADO_GUIA_COLORS[guide.estado]
                    )}
                  >
                    {ESTADO_GUIA_LABELS[guide.estado]}
                  </span>
                </td>
                <td className={cn("px-6 py-4 whitespace-nowrap text-right text-sm font-medium", soloEscritorio)}>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/despachos/${guide.id}`}
                      className="p-2 text-fg-subtle hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Ver detalle"
                    >
                      <Eye size={18} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
