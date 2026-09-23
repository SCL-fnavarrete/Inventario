import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { SesionAutenticada } from "@/lib/auth/guard";
import { sedeWhere } from "@/lib/auth/sedeScope";

import { FileSpreadsheet } from "lucide-react";
import EmpleadosSearchList from "@/components/reportes/EmpleadosSearchList";
import { PageHeader } from "@/components/ui/PageHeader";

async function getEmpleadosConActivos(session: SesionAutenticada) {
  const empleados = await prisma.employee.findMany({
    where: { estado: "activo", ...sedeWhere(session) },
    include: {
      assignments: {
        where: { activo: true },
        include: {
          asset: {
            include: {
              categoria: true },
          },
        },
      },
    },
    orderBy: [{ apellidoPaterno: "asc" }, { nombres: "asc" }],
  });

  return empleados;
}

export default async function ReporteEmpleadosPage() {
  // Scoped to the session's sede.
  const session = (await getServerSession(authOptions)) as SesionAutenticada;
  const empleados = await getEmpleadosConActivos(session);

  const empleadosConEquipos = empleados.filter((e) => e.assignments.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/reportes"
        title="Activos por Empleado"
        description={<>{empleados.length} empleados activos ({empleadosConEquipos.length} con
              equipos)</>}
        actions={
          <>
            <a
              href="/api/reportes/empleados/excel"
              className="inline-flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </a>
          </>
        }
      />

      <EmpleadosSearchList empleados={empleados} />
    </div>
  );
}
