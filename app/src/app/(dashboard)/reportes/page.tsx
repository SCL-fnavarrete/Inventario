import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  FileText,
  Package,
  Users,
  History,
  FileSpreadsheet,
  ClipboardList,
  Download,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";

async function getReporteSummary() {
  const [
    totalActivos,
    activosPorEstado,
    totalEmpleados,
    desvinculacionesPendientes,
    activosObsoletos,
  ] = await Promise.all([
    prisma.asset.count({ where: ACTIVOS_VIGENTES }),
    prisma.asset.groupBy({
      by: ["estado"],
      _count: true,
    }),
    prisma.employee.count({ where: { estado: "activo" } }),
    prisma.termination.count({
      where: {
        OR: [
          { estadoNotebook: "pendiente" },
          { estadoCelular: "pendiente" },
          { estadoMonitor: "pendiente" },
        ],
      },
    }),
    prisma.asset.count({
      where: {
        ...ACTIVOS_VIGENTES,
        OR: [
          { sistemaOperativo: { contains: "Windows 10" } },
          {
            fechaCompra: {
              lt: new Date(new Date().setFullYear(new Date().getFullYear() - 5)),
            },
          },
        ],
      },
    }),
  ]);

  return {
    totalActivos,
    activosPorEstado,
    totalEmpleados,
    desvinculacionesPendientes,
    activosObsoletos,
  };
}

export default async function ReportesPage() {
  const session = await getServerSession(authOptions);
  const summary = await getReporteSummary();

  const reportes = [
    {
      id: "inventario",
      titulo: "Inventario Completo",
      descripcion:
        "Listado de todos los activos con sus especificaciones y estados actuales",
      icono: Package,
      color: "blue",
      href: "/reportes/inventario",
      stats: `${summary.totalActivos} activos`,
    },
    {
      id: "stock",
      titulo: "Reporte de Stock",
      descripcion:
        "Disponibilidad de equipos por categoría, estado y ubicación",
      icono: TrendingUp,
      color: "green",
      href: "/reportes/stock",
      stats: `${
        summary.activosPorEstado.find((e) => e.estado === "disponible")?._count || 0
      } disponibles`,
    },
    {
      id: "trazabilidad",
      titulo: "Trazabilidad de Activos",
      descripcion:
        "Historial completo de movimientos por activo (asignaciones, devoluciones, mantenciones)",
      icono: History,
      color: "purple",
      href: "/reportes/trazabilidad",
      stats: "Por número de serie",
    },
    {
      id: "empleados",
      titulo: "Activos por Empleado",
      descripcion:
        "Equipos asignados a cada empleado con fechas y estados",
      icono: Users,
      color: "orange",
      href: "/reportes/empleados",
      stats: `${summary.totalEmpleados} empleados activos`,
    },
    {
      id: "rrhh",
      titulo: "Reporte para RRHH",
      descripcion:
        "Desvinculaciones y estados de devolución para gestión de descuentos",
      icono: ClipboardList,
      color: "red",
      href: "/reportes/rrhh",
      stats: `${summary.desvinculacionesPendientes} pendientes`,
    },
    {
      id: "obsoletos",
      titulo: "Equipos Obsoletos",
      descripcion:
        "Activos con Windows 10 o más de 5 años de antigüedad",
      icono: AlertTriangle,
      color: "yellow",
      href: "/reportes/obsoletos",
      stats: `${summary.activosObsoletos} equipos`,
    },
  ];

  const colorClasses = {
    blue: "bg-blue-50 text-blue-600 hover:bg-blue-100",
    green: "bg-green-50 text-green-600 hover:bg-green-100",
    purple: "bg-purple-50 text-purple-600 hover:bg-purple-100",
    orange: "bg-orange-50 text-orange-600 hover:bg-orange-100",
    red: "bg-red-50 text-red-600 hover:bg-red-100",
    yellow: "bg-yellow-50 text-yellow-600 hover:bg-yellow-100",
  };

  return (
    <div className="space-y-6">
      {/* Pestanas Resumen / Reportes (11-sep-2026, SPEC 2.15): Reportes paso
          de ser una seccion aparte del menu lateral a ser una subpestana
          del Dashboard -- ver DashboardTabs. */}
      <DashboardTabs />

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes</h1>
          <p className="text-gray-600">
            Genera y exporta reportes del inventario IT
          </p>
        </div>
      </div>

      {/* Grid de Reportes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reportes.map((reporte) => {
          const IconComponent = reporte.icono;
          const colorClass =
            colorClasses[reporte.color as keyof typeof colorClasses];

          return (
            <Link
              key={reporte.id}
              href={reporte.href}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${colorClass}`}>
                  <IconComponent className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{reporte.titulo}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {reporte.descripcion}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">{reporte.stats}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Exportación Rápida */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Exportación Rápida
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a
            href="/api/reportes/inventario/excel"
            className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
          >
            <FileSpreadsheet className="h-5 w-5" />
            <span className="text-sm font-medium">Inventario Excel</span>
          </a>
          <a
            href="/api/reportes/stock/excel"
            className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
          >
            <FileSpreadsheet className="h-5 w-5" />
            <span className="text-sm font-medium">Stock Excel</span>
          </a>
          <a
            href="/api/reportes/empleados/excel"
            className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
          >
            <FileSpreadsheet className="h-5 w-5" />
            <span className="text-sm font-medium">Empleados Excel</span>
          </a>
          <a
            href="/api/reportes/rrhh/excel"
            className="flex items-center gap-2 p-3 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
          >
            <FileSpreadsheet className="h-5 w-5" />
            <span className="text-sm font-medium">RRHH Excel</span>
          </a>
        </div>
      </div>
    </div>
  );
}
