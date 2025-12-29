"use client";

import Link from "next/link";
import { FileText, Eye, Download, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TIPO_DESPACHO_LABELS,
  ESTADO_GUIA_LABELS,
  ESTADO_GUIA_COLORS,
  type DispatchGuideListItem,
} from "@/types/guia-despacho";

interface GuiaDespachoTableProps {
  guides: DispatchGuideListItem[];
  loading?: boolean;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function GuiaDespachoTable({ guides, loading }: GuiaDespachoTableProps) {
  async function handleDownloadPdf(guideId: string, numero: string) {
    try {
      const response = await fetch(`/api/guias-despacho/${guideId}/pdf`);
      if (!response.ok) throw new Error("Error al descargar PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guia_despacho_${numero.replace(/\//g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      alert("Error al descargar el PDF");
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow overflow-hidden">
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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-8 text-center text-gray-500">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p>No hay guías de despacho</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                N° Guía
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Fecha
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Origen → Destino
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Destinatario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Items
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {guide.numero}
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(guide.fechaDespacho)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className="text-gray-900">{guide.origen}</span>
                  <span className="text-gray-400 mx-2">→</span>
                  <span className="text-gray-900">{guide.destino}</span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {guide.destinatarioNombre || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {TIPO_DESPACHO_LABELS[guide.tipoDespacho]}
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
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Ver detalle"
                    >
                      <Eye size={18} />
                    </Link>
                    <button
                      onClick={() => handleDownloadPdf(guide.id, guide.numero)}
                      className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Descargar PDF"
                    >
                      <Download size={18} />
                    </button>
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
