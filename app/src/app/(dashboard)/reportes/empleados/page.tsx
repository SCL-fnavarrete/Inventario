import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import EmpleadosSearchList from "@/components/reportes/EmpleadosSearchList";

async function getEmpleadosConActivos() {
  const empleados = await prisma.employee.findMany({
    where: { estado: "activo" },
    include: {
      assignments: {
        where: { activo: true },
        include: {
          asset: {
            include: {
              categoria: true,
            },
          },
        },
      },
    },
    orderBy: [{ apellidoPaterno: "asc" }, { nombres: "asc" }],
  });

  return empleados;
}

export default async function ReporteEmpleadosPage() {
  const empleados = await getEmpleadosConActivos();

  const empleadosConEquipos = empleados.filter((e) => e.assignments.length > 0);

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
              Activos por Empleado
            </h1>
            <p className="text-gray-600">
              {empleados.length} empleados activos ({empleadosConEquipos.length} con
              equipos)
            </p>
          </div>
        </div>
        <a
          href="/api/reportes/empleados/excel"
          className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar Excel
        </a>
      </div>

      <EmpleadosSearchList empleados={empleados} />
    </div>
  );
}
