import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { SesionAutenticada } from "@/lib/auth/guard";
import { sedeWhere } from "@/lib/auth/sedeScope";
import { PageHeader } from "@/components/ui/PageHeader";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { AssetConditionBadge, AssetStatusBadge } from "@/components/ui/Badge";


// Server component queries Prisma directly, so sede scoping must be applied
// manually here (it doesn't go through an API route's middleware).
async function getInventario(session: SesionAutenticada) {
  const activos = await prisma.asset.findMany({
    where: sedeWhere(session),
    include: {
      categoria: true,
      assignments: {
        where: { ...ACTIVOS_VIGENTES, activo: true },
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

export default async function ReporteInventarioPage() {
  // Scoped to the session's sede.
  const session = (await getServerSession(authOptions)) as SesionAutenticada;
  const activos = await getInventario(session);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/reportes"
        title="Inventario Completo"
        description={`${activos.length} activos registrados en el sistema`}
        actions={
          <a href="/api/reportes/inventario/excel" className={buttonClasses({ variant: "secondary" })}>
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Excel
          </a>
        }
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th px-4">
                  Categoría
                </th>
                <th className="table-th px-4">
                  Nº Serie
                </th>
                <th className="table-th px-4">
                  Marca/Modelo
                </th>
                <th className="table-th px-4">
                  Especificaciones
                </th>
                <th className="table-th px-4">
                  Estado
                </th>
                <th className="table-th px-4">
                  Condición
                </th>
                <th className="table-th px-4">
                  Asignado a
                </th>
                <th className="table-th px-4">
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
                      className="text-primary-700 hover:underline"
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
                    <AssetStatusBadge status={activo.estado} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <AssetConditionBadge condicion={activo.condicion} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {activo.assignments[0]?.employee ? (
                      <Link
                        href={`/empleados/${activo.assignments[0].employee.rut}`}
                        className="text-primary-700 hover:underline"
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
