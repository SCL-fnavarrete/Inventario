import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  ArrowLeft,
  Edit,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  User,
  Calendar,
  Tag,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstadoActivo, CondicionActivo, TipoEvento } from "@prisma/client";
import { formatearFecha } from "@/lib/utils/fechas";

const estadoColors: Record<EstadoActivo, string> = {
  disponible: "bg-green-100 text-green-800",
  asignado: "bg-blue-100 text-blue-800",
  en_mantencion: "bg-yellow-100 text-yellow-800",
  baja: "bg-red-100 text-red-800",
  vendido: "bg-gray-100 text-gray-800",
};

const estadoLabels: Record<EstadoActivo, string> = {
  disponible: "Disponible",
  asignado: "Asignado",
  en_mantencion: "En Mantención",
  baja: "Baja",
  vendido: "Vendido",
};

const condicionLabels: Record<CondicionActivo, string> = {
  nuevo: "Nuevo",
  usado: "Usado",
  danado: "Dañado",
};

// Cubre el enum TipoEvento completo. Faltaban venta, actualizacion_specs,
// solicitud_workflow y traslado (este ultimo lo emite POST /api/guias-despacho
// por cada activo trasladado), que se mostraban crudos en un historial que es
// evidencia de auditoria.
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
  // 14-sep-2026 (SPEC 2.25): nuevo evento emitido al vincular activos
  // existentes a una Compra (ver registrarVinculacionCompra en
  // assetHistoryService).
  compra: "Compra",
};

function getCategoryIcon(categoryName: string) {
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className="h-8 w-8" />;
    case "celular":
      return <Smartphone className="h-8 w-8" />;
    case "monitor":
      return <Monitor className="h-8 w-8" />;
    default:
      return <Package className="h-8 w-8" />;
  }
}

async function getAsset(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      categoria: true,
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
      // Compra con la que llego este equipo (18-sep-2026, SPEC 2.10.7): la
      // ficha no lo mostraba en ninguna parte, pese a que el vinculo ya
      // existe desde el modulo de Compras. En teoria son varias
      // (purchaseAssets es n-a-n), en la practica una.
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

  return asset;
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

  // Crear objeto de especificaciones basado en campos del schema. Cubre las
  // specs de las categorias con formulario propio -- Notebook, Celular,
  // Monitor, Impresora y los perifericos simples (Mouse/Teclado/Webcam/
  // Audifonos) -- mostrando solo lo que el activo tenga, sin asumir su
  // categoria: dos activos de la misma categoria pueden tener campos
  // distintos llenos si se crearon en momentos distintos del sistema.
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
  // SPEC 2.23 (14-sep-2026): nombre del plan de Microsoft 365 (ej. "Premium").
  if (asset.tipoLicenciaMicrosoft365) {
    especificaciones.microsoft365 = asset.tipoLicenciaMicrosoft365;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/activos"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
              {getCategoryIcon(asset.categoria.nombre)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {asset.marca} {asset.modelo}
              </h1>
              <p className="text-gray-600">
                {asset.categoria.nombre} • {asset.numeroSerie}
              </p>
            </div>
          </div>
        </div>
        <Link
          href={`/activos/${asset.id}/editar`}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Edit size={20} />
          <span>Editar</span>
        </Link>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <Tag className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Estado</p>
              <span
                className={cn(
                  "px-2 py-1 text-sm font-medium rounded-full",
                  estadoColors[asset.estado]
                )}
              >
                {estadoLabels[asset.estado]}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Condición</p>
              <p className="font-medium text-gray-900">
                {condicionLabels[asset.condicion]}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
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
        <div className="bg-white rounded-lg shadow p-4">
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
          <div className="bg-white rounded-lg shadow p-6">
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
            <div className="bg-white rounded-lg shadow p-6">
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
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Observaciones
              </h2>
              <p className="text-gray-700 whitespace-pre-wrap">
                {asset.observaciones}
              </p>
            </div>
          )}

          {/* Historial de Asignaciones */}
          {asset.assignments.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
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
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Compra e Historial */}
        <div className="space-y-6">
          {/* Compra asociada (18-sep-2026, SPEC 2.10.7). Solo aparece si el
              equipo esta vinculado a una factura: los que se cargaron a mano
              o por importacion no tienen ninguna. */}
          {asset.purchaseAssets.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
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
                        className="text-sm text-blue-600 hover:text-blue-800 whitespace-nowrap"
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

          <div className="bg-white rounded-lg shadow p-6">
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
                    <div className="absolute -left-2 top-0 w-4 h-4 bg-blue-500 rounded-full" />
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
