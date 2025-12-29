import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, AlertTriangle, Calendar, Monitor } from "lucide-react";

async function getActivosObsoletos() {
  const cincoAnosAtras = new Date();
  cincoAnosAtras.setFullYear(cincoAnosAtras.getFullYear() - 5);

  const activos = await prisma.asset.findMany({
    where: {
      estado: { not: "baja" },
      OR: [
        { sistemaOperativo: { contains: "Windows 10", mode: "insensitive" } },
        { fechaCompra: { lt: cincoAnosAtras } },
      ],
    },
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
    orderBy: { fechaCompra: "asc" },
  });

  return activos;
}

export default async function ReporteObsoletosPage() {
  const activos = await getActivosObsoletos();

  const windows10 = activos.filter((a) =>
    a.sistemaOperativo?.toLowerCase().includes("windows 10")
  );

  const antiguos = activos.filter((a) => {
    if (!a.fechaCompra) return false;
    const cincoAnosAtras = new Date();
    cincoAnosAtras.setFullYear(cincoAnosAtras.getFullYear() - 5);
    return a.fechaCompra < cincoAnosAtras;
  });

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
            <h1 className="text-2xl font-bold text-gray-900">Equipos Obsoletos</h1>
            <p className="text-gray-600">
              Activos con Windows 10 o más de 5 años de antigüedad
            </p>
          </div>
        </div>
        <a
          href="/api/reportes/obsoletos/excel"
          className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar Excel
        </a>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-yellow-50 rounded-lg shadow p-4 text-center">
          <AlertTriangle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-yellow-700">{activos.length}</p>
          <p className="text-sm text-yellow-600">Total Obsoletos</p>
        </div>
        <div className="bg-orange-50 rounded-lg shadow p-4 text-center">
          <Monitor className="h-8 w-8 text-orange-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-orange-700">{windows10.length}</p>
          <p className="text-sm text-orange-600">Con Windows 10</p>
        </div>
        <div className="bg-red-50 rounded-lg shadow p-4 text-center">
          <Calendar className="h-8 w-8 text-red-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-red-700">{antiguos.length}</p>
          <p className="text-sm text-red-600">Más de 5 años</p>
        </div>
      </div>

      {/* Alerta */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-800">
              Acción Recomendada
            </h3>
            <p className="text-sm text-yellow-700 mt-1">
              Los equipos con Windows 10 deberán ser actualizados a Windows 11 antes
              del fin del soporte (octubre 2025). Los equipos con más de 5 años de
              antigüedad deberían ser evaluados para renovación.
            </p>
          </div>
        </div>
      </div>

      {/* Tabla de Equipos */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Listado de Equipos Obsoletos
          </h2>
        </div>
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
                  Sistema Operativo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Fecha Compra
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Antigüedad
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Asignado a
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Motivo
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activos.map((activo) => {
                const antiguedad = activo.fechaCompra
                  ? Math.floor(
                      (Date.now() - new Date(activo.fechaCompra).getTime()) /
                        (365.25 * 24 * 60 * 60 * 1000)
                    )
                  : null;

                const esWindows10 = activo.sistemaOperativo
                  ?.toLowerCase()
                  .includes("windows 10");
                const esAntiguo = antiguedad !== null && antiguedad >= 5;

                return (
                  <tr key={activo.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {activo.categoria?.nombre || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      <Link
                        href={`/activos/${activo.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {activo.numeroSerie || "-"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="font-medium">{activo.marca}</div>
                      <div className="text-gray-500">{activo.modelo}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {esWindows10 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 rounded-full text-xs">
                          <AlertTriangle className="h-3 w-3" />
                          {activo.sistemaOperativo}
                        </span>
                      ) : (
                        <span className="text-gray-600">
                          {activo.sistemaOperativo || "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {activo.fechaCompra
                        ? new Date(activo.fechaCompra).toLocaleDateString("es-CL")
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {antiguedad !== null ? (
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            antiguedad >= 5
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {antiguedad} años
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {activo.assignments[0]?.employee ? (
                        <span>
                          {activo.assignments[0].employee.nombres}{" "}
                          {activo.assignments[0].employee.apellidoPaterno}
                        </span>
                      ) : (
                        <span className="text-gray-400">No asignado</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {esWindows10 && (
                          <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-xs">
                            Win10
                          </span>
                        )}
                        {esAntiguo && (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">
                            Antiguo
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recomendaciones */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recomendaciones
        </h2>
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg">
            <Monitor className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-orange-800">
                Equipos con Windows 10 ({windows10.length})
              </h3>
              <p className="text-sm text-orange-700 mt-1">
                Programar actualización a Windows 11 o evaluar compatibilidad de
                hardware. El soporte de Windows 10 finaliza en octubre 2025.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg">
            <Calendar className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-800">
                Equipos con más de 5 años ({antiguos.length})
              </h3>
              <p className="text-sm text-red-700 mt-1">
                Evaluar renovación de equipos. Considerar: rendimiento actual,
                costo de mantenimiento vs. reemplazo, necesidades del usuario.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
