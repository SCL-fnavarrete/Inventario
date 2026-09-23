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

export function GuiaDespachoTable({ guides, loading }: GuiaDespachoTableProps) {
  if (loading) {
    return (
      <div className="card overflow-hidden">
        <div className="p-8 text-center text-gray-500">
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
        <div className="p-8 text-center text-gray-500">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p>No hay guías de despacho</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">
                N° Guía
              </th>
              <th className="table-th">
                Fecha
              </th>
              <th className="table-th">
                OT Chilexpress
              </th>
              <th className="table-th">
                Sede origen
              </th>
              <th className="table-th">
                Sede destino
              </th>
              <th className="table-th">
                Receptor
              </th>
              <th className="table-th">
                Items
              </th>
              <th className="table-th">
                Estado
              </th>
              <th className="table-th text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {guides.map((guide) => (
              <tr key={guide.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    href={`/guias-despacho/${guide.id}`}
                    className="text-primary-700 hover:text-primary-900 font-medium"
                  >
                    {guide.numero}
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatearFechaCorta(guide.fechaDespacho)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                  {guide.otChilexpress}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {guide.sede?.nombre || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {guide.sedeDestino?.nombre || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {guide.receptorNombre}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {guide._count.items}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={cn(
                      "inline-flex px-2 py-1 text-xs font-medium rounded-full",
                      ESTADO_GUIA_COLORS[guide.estado]
                    )}
                  >
                    {ESTADO_GUIA_LABELS[guide.estado]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/guias-despacho/${guide.id}`}
                      className="p-2 text-gray-400 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
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
