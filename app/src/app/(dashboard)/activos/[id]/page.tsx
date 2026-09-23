import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import type { SesionAutenticada } from "@/lib/auth/guard";
import { tieneVisibilidadTotal } from "@/lib/auth/sedeScope";
import {
  Edit,
  User,
  Calendar,
  Tag,
  Clock,
  AlertCircle,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TipoEvento } from "@prisma/client";
import { formatearFecha } from "@/lib/utils/fechas";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { CONDICION_ACTIVO_LABEL } from "@/lib/constants/estadosActivo";

// Covers the full TipoEvento enum so no event type renders as raw text
// in the audit history.
const tipoEventoLabels: Record<TipoEvento, string> = {
  creacion: "Creación",
  asignacion: "Asignación",
  devolucion: "Devolución",
  mantencion: "Mantención",
  cambio_estado: "Cambio de Estado",
  actualizacion_specs: "Actualización de Specs",
  baja: "Baja",
  venta: "Venta",
  solicitud_workflow: "Solicitud",
  traslado: "Traslado",
  // Emitted when linking existing assets to a Compra.
  compra: "Compra",
};

async function getAsset(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      categoria: true,
      // The asset's sede determines its visibility (see sedeScope.ts).
      sede: { select: { nombre: true } },
      empleadoActual: {
        select: { nombres: true, apellidoPaterno: true, rut: true },
      },
      history: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      assignments: {
        include: {
          employee: {
            select: { nombres: true, apellidoPaterno: true, rut: true },
          },
        },
        orderBy: { fechaEntrega: "desc" },
        take: 10,
      },
      maintenances: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
      // The purchase this asset arrived with, if any (n-to-n relation,
      // though in practice there's usually just one).
      purchaseAssets: {
        include: {
          purchase: {
            include: { sede: { select: { nombre: true } } },
          },
        },
        orderBy: { purchase: { fechaFactura: "desc" } },
      },
    },
  });

  if (!asset) return asset;

  // Historical assignments without an identified employee (from a legacy
  // import) can't have a real Assignment record, since employeeId is
  // required. They're stored as AssetHistory rows flagged with
  // datosNuevos.historicaSinPersona, and fetched separately here (not from
  // the `history` query above, which is capped at take:20) so they can also
  // be shown in the assignment history panel alongside real assignments.
  const historialAsignacionesSinPersona = await prisma.assetHistory.findMany({
    where: { assetId: asset.id, tipoEvento: "asignacion" },
    orderBy: { createdAt: "asc" },
  });

  return {
    ...asset,
    historialAsignacionesSinPersona: historialAsignacionesSinPersona.filter(
      (h) => (h.datosNuevos as { historicaSinPersona?: boolean } | null)?.historicaSinPersona === true
    ),
  };
}

export default async function DetalleActivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const asset = await getAsset(id);

  if (!asset) {
    notFound();
  }

  // Sede isolation: this page queries Prisma directly (not through
  // /api/activos/:id), so the API's assertSedeAccess check doesn't apply
  // here and must be replicated. Returns 404 (not 403) to avoid revealing
  // that the record exists in another sede.
  const session = (await getServerSession(authOptions)) as SesionAutenticada | null;
  if (!session) {
    notFound();
  }
  if (!tieneVisibilidadTotal(session) && asset.sedeId !== session.user.sedeId) {
    notFound();
  }

  // Builds the specs object from whichever schema fields are set, without
  // assuming a fixed set per category (assets of the same category may
  // have different fields filled depending on when they were created).
  const especificaciones: Record<string, string> = {};
  if (asset.procesador) especificaciones.procesador = asset.procesador;
  if (asset.discoDuro) especificaciones.discoDuro = asset.discoDuro;
  if (asset.ram) especificaciones.ram = asset.ram;
  if (asset.pulgadas) especificaciones.pulgadas = String(asset.pulgadas);
  if (asset.sistemaOperativo) especificaciones.sistemaOperativo = asset.sistemaOperativo;
  if (asset.antivirus) especificaciones.antivirus = asset.antivirus;
  if (asset.nombreEquipo) especificaciones.nombreEquipo = asset.nombreEquipo;
  if (asset.imei) especificaciones.imei = asset.imei;
  if (asset.numeroTelefono) especificaciones.numeroTelefono = asset.numeroTelefono;
  if (asset.tipoPlan) especificaciones.tipoPlan = asset.tipoPlan;
  if (asset.conectividad) especificaciones.conectividad = asset.conectividad;
  // Name of the Microsoft 365 plan (e.g. "Premium").
  if (asset.tipoLicenciaMicrosoft365) {
    especificaciones.microsoft365 = asset.tipoLicenciaMicrosoft365;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        backHref="/activos"
        leading={
          <div className="rounded-card bg-primary-50 p-3 text-primary-700">
            <CategoryIcon categoria={asset.categoria.nombre} className="h-8 w-8" />
          </div>
        }
        title={`${asset.marca} ${asset.modelo}`}
        description={`${asset.categoria.nombre} • ${asset.numeroSerie ?? "Sin n° de serie"}`}
        actions={
          <Link href={`/activos/${asset.id}/editar`} className={buttonClasses()}>
            <Edit size={18} />
            <span>Editar</span>
          </Link>
        }
      />

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Tag className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Estado</p>
              <AssetStatusBadge status={asset.estado} />
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Condición</p>
              <p className="font-medium text-gray-900">
                {CONDICION_ACTIVO_LABEL[asset.condicion]}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Sede</p>
              <p className="font-medium text-gray-900">
                {asset.sede?.nombre || "Sin sede"}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Asignado a</p>
              <p className="font-medium text-gray-900">
                {asset.empleadoActual
                  ? `${asset.empleadoActual.nombres} ${asset.empleadoActual.apellidoPaterno}`
                  : "Sin asignar"}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Fecha Compra</p>
              <p className="font-medium text-gray-900">
                {asset.fechaCompra
                  ? formatearFecha(asset.fechaCompra)
                  : "No registrada"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Información General */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Información General
            </h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">Número de Serie</dt>
                <dd className="font-medium text-gray-900">{asset.numeroSerie}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Marca</dt>
                <dd className="font-medium text-gray-900">{asset.marca}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Modelo</dt>
                <dd className="font-medium text-gray-900">{asset.modelo}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Categoría</dt>
                <dd className="font-medium text-gray-900">
                  {asset.categoria.nombre}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Ubicación Física</dt>
                <dd className="font-medium text-gray-900">
                  {asset.ubicacionFisica || "-"}
                </dd>
              </div>
            </dl>
          </div>

          {/* Especificaciones Técnicas */}
          {especificaciones && Object.keys(especificaciones).length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Especificaciones Técnicas
              </h2>
              <dl className="grid grid-cols-2 gap-4">
                {Object.entries(especificaciones).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-sm text-gray-500 capitalize">{key}</dt>
                    <dd className="font-medium text-gray-900">{value || "-"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Observaciones */}
          {asset.observaciones && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Observaciones
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {asset.observaciones}
              </p>
            </div>
          )}

          {/* Assignment history: combines real assignments (with an
              identified employee) and legacy import rows without a person,
              shown with a "No registrado" placeholder instead of a
              fabricated employee. */}
          {(asset.assignments.length > 0 || asset.historialAsignacionesSinPersona.length > 0) && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Historial de Asignaciones
              </h2>
              <div className="space-y-3">
                {asset.assignments.map((asig) => (
                  <div
                    key={asig.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {asig.employee.nombres} {asig.employee.apellidoPaterno}
                      </p>
                      <p className="text-sm text-gray-500">
                        RUT: {asig.employee.rut}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-900">
                        {formatearFecha(asig.fechaEntrega)}
                      </p>
                      <span
                        className={cn(
                          "px-2 py-0.5 text-xs font-medium rounded-full",
                          asig.activo
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        )}
                      >
                        {asig.activo ? "Activa" : "Finalizada"}
                      </span>
                    </div>
                  </div>
                ))}
                {asset.historialAsignacionesSinPersona.map((evento) => {
                  const datos = evento.datosNuevos as { indice?: number; total?: number } | null;
                  return (
                    <div
                      key={evento.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-dashed border-gray-300"
                    >
                      <div>
                        <p className="font-medium text-gray-500 italic">
                          Persona no registrada
                          {datos?.indice && datos?.total && datos.total > 1 ? ` (${datos.indice} de ${datos.total})` : ""}
                        </p>
                        <p className="text-sm text-gray-400">
                          RUT: No registrado
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">
                          Fecha no registrada
                        </p>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500">
                          Histórica (sin datos)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Compra e Historial */}
        <div className="space-y-6">
          {/* Only shown when the asset is linked to a purchase invoice;
              manually created or imported assets may have none. */}
          {asset.purchaseAssets.length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {asset.purchaseAssets.length === 1 ? "Compra asociada" : "Compras asociadas"}
              </h2>
              <div className="space-y-4">
                {asset.purchaseAssets.map((pa) => (
                  <div key={pa.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="font-medium text-gray-900">
                        Factura {pa.purchase.numeroFactura || "s/n"}
                      </p>
                      <Link
                        href={`/compras/${pa.purchase.id}`}
                        className="text-sm text-primary-700 hover:text-primary-900 whitespace-nowrap"
                      >
                        Ver compra
                      </Link>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p>Fecha: {formatearFecha(pa.purchase.fechaFactura)}</p>
                      {pa.purchase.ordenCompra && <p>Orden de compra: {pa.purchase.ordenCompra}</p>}
                      {pa.purchase.rutProveedor && <p>Proveedor: {pa.purchase.rutProveedor}</p>}
                      {pa.purchase.sede && <p>Sede: {pa.purchase.sede.nombre}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Historial de Eventos
            </h2>
            {asset.history.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                No hay eventos registrados
              </p>
            ) : (
              <div className="space-y-4">
                {asset.history.map((evento) => (
                  <div
                    key={evento.id}
                    className="relative pl-6 pb-4 border-l-2 border-gray-200 last:pb-0"
                  >
                    <div className="absolute -left-2 top-0 w-4 h-4 bg-primary-500 rounded-full" />
                    <div>
                      <p className="font-medium text-gray-900">
                        {tipoEventoLabels[evento.tipoEvento] || evento.tipoEvento}
                      </p>
                      <p className="text-sm text-gray-600">{evento.descripcion}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        <span>
                          {new Date(evento.createdAt).toLocaleString("es-CL")}
                        </span>
                        {evento.usuarioSistema && (
                          <span>• {evento.usuarioSistema}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
