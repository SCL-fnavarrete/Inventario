import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { SesionAutenticada } from "@/lib/auth/guard";
import { sedeWhere } from "@/lib/auth/sedeScope";

import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, AlertTriangle, CheckCircle, Clock } from "lucide-react";

async function getDesvinculacionesRRHH(session: SesionAutenticada) {
  const desvinculaciones = await prisma.termination.findMany({
    // Termination no tiene sedeId propio -- se filtra via su empleado, mismo
    // criterio que /api/reportes/rrhh/excel.
    where: { employee: sedeWhere(session) },
    include: {
      employee: {
        select: {
          id: true,
          rut: true,
          nombres: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          cargo: true,
          ubicacion: true,
          jefatura: true,
        },
      },
    },
    orderBy: { fechaDesvinculacion: "desc" },
  });

  return desvinculaciones;
}

const ESTADO_CONFIG = {
  ok: { color: "bg-green-100 text-green-800", icon: CheckCircle, label: "OK" },
  danado: { color: "bg-red-100 text-red-800", icon: AlertTriangle, label: "Danado" },
  pendiente: { color: "bg-yellow-100 text-yellow-800", icon: Clock, label: "Pendiente" },
  no_aplica: { color: "bg-gray-100 text-gray-800", icon: null, label: "N/A" },
};

export default async function ReporteRRHHPage() {
  // La sesion decide que sede se ve (SPEC 2.29.2, ver nota arriba).
  const session = (await getServerSession(authOptions)) as SesionAutenticada;
  const desvinculaciones = await getDesvinculacionesRRHH(session);

  const pendientes = desvinculaciones.filter(
    (d) =>
      d.estadoNotebook === "pendiente" ||
      d.estadoCelular === "pendiente" ||
      d.estadoMonitor === "pendiente"
  );

  const conDescuento = desvinculaciones.filter((d) => d.requiereDescuento);

  const completadas = desvinculaciones.filter(
    (d) =>
      d.estadoNotebook !== "pendiente" &&
      d.estadoCelular !== "pendiente" &&
      d.estadoMonitor !== "pendiente"
  );

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
            <h1 className="text-2xl font-bold text-gray-900">Reporte para RRHH</h1>
            <p className="text-gray-600">
              Desvinculaciones y estados de devolucion
            </p>
          </div>
        </div>
        <a
          href="/api/reportes/rrhh/excel"
          className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar Excel
        </a>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">
            {desvinculaciones.length}
          </p>
          <p className="text-sm text-gray-500">Total Desvinculaciones</p>
        </div>
        <div className="bg-yellow-50 rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-yellow-700">{pendientes.length}</p>
          <p className="text-sm text-yellow-600">Devoluciones Pendientes</p>
        </div>
        <div className="bg-red-50 rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{conDescuento.length}</p>
          <p className="text-sm text-red-600">Requieren Descuento</p>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{completadas.length}</p>
          <p className="text-sm text-green-600">Completadas</p>
        </div>
      </div>

      {/* Tabla de Desvinculaciones */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Detalle de Desvinculaciones
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Empleado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  RUT
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Fecha Desvinc.
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Notebook
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Celular
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Monitor
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Kit
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Descuento
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Notificado
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {desvinculaciones.map((desv) => {
                const notebookConfig =
                  ESTADO_CONFIG[desv.estadoNotebook as keyof typeof ESTADO_CONFIG];
                const celularConfig =
                  ESTADO_CONFIG[desv.estadoCelular as keyof typeof ESTADO_CONFIG];
                const monitorConfig =
                  ESTADO_CONFIG[desv.estadoMonitor as keyof typeof ESTADO_CONFIG];
                const kitConfig =
                  ESTADO_CONFIG[desv.estadoKit as keyof typeof ESTADO_CONFIG];

                return (
                  <tr key={desv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/desvinculaciones/${desv.id}`}
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {desv.employee.nombres} {desv.employee.apellidoPaterno}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {desv.employee.cargo} | {desv.employee.ubicacion}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                      {desv.employee.rut}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(desv.fechaDesvinculacion).toLocaleDateString("es-CL")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${notebookConfig?.color || "bg-gray-100"}`}
                      >
                        {notebookConfig?.icon && (
                          <notebookConfig.icon className="h-3 w-3" />
                        )}
                        {notebookConfig?.label || desv.estadoNotebook}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${celularConfig?.color || "bg-gray-100"}`}
                      >
                        {celularConfig?.icon && (
                          <celularConfig.icon className="h-3 w-3" />
                        )}
                        {celularConfig?.label || desv.estadoCelular}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${monitorConfig?.color || "bg-gray-100"}`}
                      >
                        {monitorConfig?.icon && (
                          <monitorConfig.icon className="h-3 w-3" />
                        )}
                        {monitorConfig?.label || desv.estadoMonitor}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${kitConfig?.color || "bg-gray-100"}`}
                      >
                        {kitConfig?.icon && <kitConfig.icon className="h-3 w-3" />}
                        {kitConfig?.label || desv.estadoKit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {desv.requiereDescuento ? (
                        <span className="text-red-600 font-medium">
                          ${Number(desv.montoDescuento || 0).toLocaleString("es-CL")}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {desv.notificadoRrhh ? (
                        <CheckCircle className="h-5 w-5 text-green-600 mx-auto" />
                      ) : (
                        <Clock className="h-5 w-5 text-yellow-600 mx-auto" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen de Descuentos */}
      {conDescuento.length > 0 && (
        <div className="bg-red-50 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-red-900 mb-4">
            Empleados con Descuento Requerido
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-red-200">
                  <th className="px-4 py-2 text-left text-sm font-medium text-red-800">
                    Empleado
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-red-800">
                    RUT
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-red-800">
                    Motivo
                  </th>
                  <th className="px-4 py-2 text-right text-sm font-medium text-red-800">
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody>
                {conDescuento.map((d) => (
                  <tr key={d.id} className="border-b border-red-100">
                    <td className="px-4 py-2 text-sm text-red-900">
                      {d.employee.nombres} {d.employee.apellidoPaterno}
                    </td>
                    <td className="px-4 py-2 text-sm font-mono text-red-900">
                      {d.employee.rut}
                    </td>
                    <td className="px-4 py-2 text-sm text-red-700">
                      {d.motivoDescuento || "No especificado"}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-semibold text-red-900">
                      ${Number(d.montoDescuento || 0).toLocaleString("es-CL")}
                    </td>
                  </tr>
                ))}
                <tr className="bg-red-100">
                  <td colSpan={3} className="px-4 py-2 text-sm font-bold text-red-900">
                    TOTAL DESCUENTOS
                  </td>
                  <td className="px-4 py-2 text-sm text-right font-bold text-red-900">
                    $
                    {conDescuento
                      .reduce((sum, d) => sum + Number(d.montoDescuento || 0), 0)
                      .toLocaleString("es-CL")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
