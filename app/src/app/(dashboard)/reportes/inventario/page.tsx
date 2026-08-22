import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

async function getInventario() {
  const activos = await prisma.asset.findMany({
    where: ACTIVOS_VIGENTES,
    include: {
      categoria: true,
      assignments: {
        where: { activo: true },
        include: {
          employee: {
            select: {
              rut: true,
              nombres: true,
              apellidoPaterno: true,
            },
          },
        },
        take: 1,
      },
    },
    orderBy: [{ categoria: { nombre: "asc" } }, { marca: "asc" }, { modelo: "asc" }],
  });

  return activos;
}

const ESTADO_COLORS: Record<string, string> = {
  disponible: "bg-green-100 text-green-800",
  asignado: "bg-blue-100 text-blue-800",
  en_mantencion: "bg-orange-100 text-orange-800",
  reutilizable: "bg-purple-100 text-purple-800",
  baja: "bg-red-100 text-red-800",
  vendido: "bg-gray-100 text-gray-800",
};

const CONDICION_COLORS: Record<string, string> = {
  nuevo: "bg-green-100 text-green-800",
  usado: "bg-yellow-100 text-yellow-800",
  danado: "bg-red-100 text-red-800",
};

export default async function ReporteInventarioPage() {
  const activos = await getInventario();

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
            <h1 className="text-2xl font-bold text-gray-900">
              Inventario Completo
            </h1>
            <p className="text-gray-600">
              {activos.length} activos registrados en el sistema
            </p>
          </div>
        </div>
        <a
          href="/api/reportes/inventario/excel"
          className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar Excel
        </a>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Categoría
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Nº Serie
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Marca/Modelo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Especificaciones
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Estado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Condición
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Asignado a
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Ubicación
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activos.map((activo) => (
                <tr key={activo.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {activo.categoria?.nombre || "-"}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">
                    <Link
                      href={`/activos/${activo.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {activo.numeroSerie || activo.imei || "-"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="font-medium">{activo.marca}</div>
                    <div className="text-gray-500">{activo.modelo}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {activo.procesador && <div>{activo.procesador}</div>}
                    {activo.ram && activo.discoDuro && (
                      <div>
                        {activo.ram} / {activo.discoDuro}
                      </div>
                    )}
                    {activo.numeroTelefono && <div>Tel: {activo.numeroTelefono}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        ESTADO_COLORS[activo.estado] || "bg-gray-100"
                      }`}
                    >
                      {activo.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        CONDICION_COLORS[activo.condicion] || "bg-gray-100"
                      }`}
                    >
                      {activo.condicion}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {activo.assignments[0]?.employee ? (
                      <Link
                        href={`/empleados/${activo.assignments[0].employee.rut}`}
                        className="text-blue-600 hover:underline"
                      >
                        {activo.assignments[0].employee.nombres}{" "}
                        {activo.assignments[0].employee.apellidoPaterno}
                      </Link>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {activo.ubicacionFisica || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
