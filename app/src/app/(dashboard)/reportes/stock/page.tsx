import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { SesionAutenticada } from "@/lib/auth/guard";
import { sedeWhere } from "@/lib/auth/sedeScope";

import Link from "next/link";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";

async function getStockData(session: SesionAutenticada) {
  const categorias = await prisma.assetCategory.findMany({
    include: {
      assets: {
        where: sedeWhere(session),
        select: {
          id: true,
          estado: true,
          ubicacionFisica: true,
        },
      },
    },
    orderBy: { nombre: "asc" },
  });

  // Procesar datos
  const stockData = categorias.map((cat) => {
    const disponibles = cat.assets.filter((a) => a.estado === "disponible").length;
    const asignados = cat.assets.filter((a) => a.estado === "asignado").length;
    const enMantencion = cat.assets.filter((a) => a.estado === "en_mantencion").length;
    const baja = cat.assets.filter((a) => a.estado === "baja").length;

    // Agrupar por ubicación
    const ubicaciones: Record<string, number> = {};
    cat.assets.forEach((a) => {
      const ub = a.ubicacionFisica || "Sin ubicación";
      ubicaciones[ub] = (ubicaciones[ub] || 0) + 1;
    });

    return {
      categoria: cat.nombre,
      total: cat.assets.length,
      disponibles,
      asignados,
      enMantencion,
      baja,
      ubicaciones,
    };
  });

  // Totales generales
  const totales = {
    total: stockData.reduce((acc, c) => acc + c.total, 0),
    disponibles: stockData.reduce((acc, c) => acc + c.disponibles, 0),
    asignados: stockData.reduce((acc, c) => acc + c.asignados, 0),
    enMantencion: stockData.reduce((acc, c) => acc + c.enMantencion, 0),
    baja: stockData.reduce((acc, c) => acc + c.baja, 0),
  };

  return { stockData, totales };
}

export default async function ReporteStockPage() {
  // La sesion decide que sede se ve (SPEC 2.29.2, ver nota arriba).
  const session = (await getServerSession(authOptions)) as SesionAutenticada;
  const { stockData, totales } = await getStockData(session);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/reportes"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reporte de Stock</h1>
            <p className="text-gray-600">
              Disponibilidad de equipos por categoría y estado
            </p>
          </div>
        </div>
        <a
          href="/api/reportes/stock/excel"
          className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar Excel
        </a>
      </div>

      {/* Resumen General */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{totales.total}</p>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4 text-center">
          <p className="text-sm text-green-600">Disponibles</p>
          <p className="text-2xl font-bold text-green-700">{totales.disponibles}</p>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-4 text-center">
          <p className="text-sm text-blue-600">Asignados</p>
          <p className="text-2xl font-bold text-blue-700">{totales.asignados}</p>
        </div>
        <div className="bg-orange-50 rounded-lg shadow p-4 text-center">
          <p className="text-sm text-orange-600">Mantención</p>
          <p className="text-2xl font-bold text-orange-700">{totales.enMantencion}</p>
        </div>
        <div className="bg-red-50 rounded-lg shadow p-4 text-center">
          <p className="text-sm text-red-600">Baja</p>
          <p className="text-2xl font-bold text-red-700">{totales.baja}</p>
        </div>
      </div>

      {/* Tabla por Categoría */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Stock por Categoría
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Categoría
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Total
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-green-600 uppercase">
                  Disponibles
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-blue-600 uppercase">
                  Asignados
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-orange-600 uppercase">
                  Mantención
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-red-600 uppercase">
                  Baja
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stockData.map((row) => (
                <tr key={row.categoria} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {row.categoria}
                  </td>
                  <td className="px-6 py-4 text-sm text-center font-semibold text-gray-900">
                    {row.total}
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 bg-green-100 text-green-800 rounded-full font-medium">
                      {row.disponibles}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                      {row.asignados}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 bg-orange-100 text-orange-800 rounded-full font-medium">
                      {row.enMantencion}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-center">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 bg-red-100 text-red-800 rounded-full font-medium">
                      {row.baja}
                    </span>
                  </td>
                </tr>
              ))}
              {/* Fila de totales */}
              <tr className="bg-gray-100 font-bold">
                <td className="px-6 py-4 text-sm text-gray-900">TOTALES</td>
                <td className="px-6 py-4 text-sm text-center text-gray-900">
                  {totales.total}
                </td>
                <td className="px-6 py-4 text-sm text-center text-green-700">
                  {totales.disponibles}
                </td>
                <td className="px-6 py-4 text-sm text-center text-blue-700">
                  {totales.asignados}
                </td>
                <td className="px-6 py-4 text-sm text-center text-orange-700">
                  {totales.enMantencion}
                </td>
                <td className="px-6 py-4 text-sm text-center text-red-700">
                  {totales.baja}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle por Ubicación */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Distribución por Ubicación
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stockData.map((cat) => (
            <div key={cat.categoria} className="border rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-2">{cat.categoria}</h3>
              <div className="space-y-1">
                {Object.entries(cat.ubicaciones).map(([ubicacion, cantidad]) => (
                  <div
                    key={ubicacion}
                    className="flex justify-between text-sm text-gray-600"
                  >
                    <span>{ubicacion}</span>
                    <span className="font-medium">{cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
