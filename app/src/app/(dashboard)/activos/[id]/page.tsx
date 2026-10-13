import { notFound } from "next/navigation";
import Link from "next/link";
import { fichaActivo } from "@/modules/activos/servidor";
import {
  Edit,
  User,
  Calendar,
  Tag,
  Clock,
  AlertCircle,
  MapPin,
  Trash2,
  Wrench,
} from "lucide-react";
import { cn } from "@/shared/cn";
import type { TipoEvento } from "@prisma/client";
import { formatearFecha } from "@/shared/utilidades/fechas";
import { formatearClp } from "@/shared/utilidades/moneda";
import { CategoryIcon, AssetStatusBadge, EliminarActivo } from "@/modules/activos/componentes";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import {
  CONDICION_ACTIVO_LABEL,
  EVENTOS_SIN_USO,
  motivoSinBaja,
  motivoSinEliminar,
  motivoSinMantencion,
  identificadorActivo,
} from "@/modules/activos";
import { Can } from "@/shared/ui/Can";
import { TablaAsignaciones, type FilaAsignacion } from "@/shared/ui/TablaAsignaciones";
import { EnlacesLineas } from "@/modules/lineas/componentes";

// Covers the full TipoEvento enum so no event type renders as raw text
// in the audit history.
const tipoEventoLabels: Record<TipoEvento, string> = {
  creacion: "Creación",
  asignacion: "Asignación",
  devolucion: "Devolución",
  mantencion: "Mantención",
  cambio_estado: "Cambio de Estado",
  actualizacion_specs: "Edición de datos",
  baja: "Baja",
  solicitud_workflow: "Solicitud",
  traslado: "Traslado",
  // Emitted when linking existing assets to a Compra.
  compra: "Compra",
};

export default async function DetalleActivoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const asset = await fichaActivo(id);

  if (!asset) {
    notFound();
  }

  // Builds the specs object from whichever schema fields are set, without
  // assuming a fixed set per category (assets of the same category may
  // have different fields filled depending on when they were created).
  const especificaciones: Record<string, React.ReactNode> = {};
  if (asset.procesador) especificaciones.procesador = asset.procesador;
  if (asset.discoDuro) especificaciones.discoDuro = asset.discoDuro;
  if (asset.ram) especificaciones.ram = asset.ram;
  if (asset.pulgadas) especificaciones.pulgadas = String(asset.pulgadas);
  if (asset.sistemaOperativo) especificaciones.sistemaOperativo = asset.sistemaOperativo;
  if (asset.antivirus) especificaciones.antivirus = asset.antivirus;
  if (asset.nombreEquipo) especificaciones.nombreEquipo = asset.nombreEquipo;
  if (asset.lineas.length) especificaciones["Línea"] = <EnlacesLineas lineas={asset.lineas} />;
  if (asset.conectividad) especificaciones.conectividad = asset.conectividad;
  // Name of the Microsoft 365 plan (e.g. "Premium").
  if (asset.tipoLicenciaMicrosoft365) {
    especificaciones.microsoft365 = asset.tipoLicenciaMicrosoft365;
  }

  // Por que no se puede dar de baja (null si se puede).
  const bloqueoBaja = motivoSinBaja(asset);
  // Se puede borrar de la base si se ingreso por error y nunca se uso (SPEC
  // 2.130). Los despachos los revisa el servidor.
  const usos =
    asset.assignments.length +
    asset.historialAsignacionesSinPersona.length +
    asset.maintenances.length +
    asset.purchaseAssets.length +
    asset.history.filter((e) => !(EVENTOS_SIN_USO as readonly string[]).includes(e.tipoEvento)).length;
  const sePuedeEliminar = !motivoSinEliminar({ estado: asset.estado, usos });

  // Asignaciones reales y filas historicas del import sin persona (se muestran
  // con "Persona no registrada" en vez de inventar una).
  const filasAsignaciones: FilaAsignacion[] = [
    ...asset.assignments.map((asig) => ({
      id: asig.id,
      desde: asig.fechaEntrega,
      hasta: asig.fechaDevolucion,
      vigente: asig.activo,
      persona: {
        nombre: `${asig.employee.nombres} ${asig.employee.apellidoPaterno}`,
        enlace: `/empleados/${asig.employeeId}`,
        detalle: `RUT: ${asig.employee.rut || "—"}`,
      },
    })),
    ...asset.historialAsignacionesSinPersona.map((evento) => {
      const datos = evento.datosNuevos as { indice?: number; total?: number } | null;
      return {
        id: evento.id,
        desde: null,
        hasta: null,
        vigente: false,
        etiqueta: "Histórica (sin datos)",
        persona: {
          nombre: `Persona no registrada${datos?.indice && datos?.total && datos.total > 1 ? ` (${datos.indice} de ${datos.total})` : ""}`,
          detalle: "RUT: No registrado",
        },
      };
    }),
  ];

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
        description={`${asset.categoria.nombre} • ${identificadorActivo(asset, "Sin n° de serie")}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/activos/${asset.id}/editar`} className={buttonClasses()}>
              <Edit size={18} />
              <span>Editar</span>
            </Link>
            {/* Programar con el equipo ya elegido (SPEC 2.98), solo si admite mantenciones. */}
            {!motivoSinMantencion(asset.estado) && (
              <Can recurso="mantenciones">
                <Link
                  href={`/mantenciones/programar?activoId=${asset.id}`}
                  className={buttonClasses({ variant: "outline" })}
                >
                  <Wrench size={18} />
                  <span>Programar mantención</span>
                </Link>
              </Can>
            )}
            {/* Dar de baja es directo, con su motivo (SPEC 2.140). Si no se
                puede, el boton queda desactivado y dice por que. */}
            {asset.estado !== "baja" ? (
              <Can recurso="activos">
                {bloqueoBaja ? (
                  <span
                    aria-disabled="true"
                    title={bloqueoBaja}
                    className={cn(buttonClasses({ variant: "outline" }), "cursor-not-allowed opacity-60")}
                  >
                    <Trash2 size={18} />
                    <span>Dar de baja</span>
                  </span>
                ) : (
                  <Link
                    href={`/activos/${asset.id}/baja`}
                    className={buttonClasses({ variant: "outline" })}
                  >
                    <Trash2 size={18} />
                    <span>Dar de baja</span>
                  </Link>
                )}
              </Can>
            ) : null}
            {sePuedeEliminar && (
              <Can recurso="activos" accion="delete">
                <EliminarActivo id={asset.id} nombre={`${asset.marca} ${asset.modelo}`} />
              </Can>
            )}
          </div>
        }
      />

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Tag className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Estado</p>
              <AssetStatusBadge status={asset.estado} />
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Condición</p>
              <p className="font-medium text-fg">
                {CONDICION_ACTIVO_LABEL[asset.condicion]}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Sede</p>
              <p className="font-medium text-fg">
                {asset.sede?.nombre || "Sin sede"}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Asignado a</p>
              <p className="font-medium text-fg">
                {asset.empleadoActual ? (
                  <Link href={`/empleados/${asset.empleadoActualId}`} className="text-primary-700 hover:underline">
                    {asset.empleadoActual.nombres} {asset.empleadoActual.apellidoPaterno}
                  </Link>
                ) : (
                  "Sin asignar"
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-fg-subtle" />
            <div>
              <p className="text-sm text-fg-subtle">Fecha Compra</p>
              <p className="font-medium text-fg">
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
            <h2 className="text-lg font-semibold text-fg mb-4">
              Información General
            </h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-fg-subtle">Número de Serie</dt>
                <dd className="font-medium text-fg">{asset.numeroSerie || "—"}</dd>
              </div>
              {/* El IMEI identifica al celular (SPEC 2.112.7): va junto a la serie. */}
              {asset.imei && (
                <div>
                  <dt className="text-sm text-fg-subtle">IMEI</dt>
                  <dd className="font-mono font-medium text-fg">{asset.imei}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm text-fg-subtle">Marca</dt>
                <dd className="font-medium text-fg">{asset.marca}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-subtle">Modelo</dt>
                <dd className="font-medium text-fg">{asset.modelo}</dd>
              </div>
              <div>
                <dt className="text-sm text-fg-subtle">Categoría</dt>
                <dd className="font-medium text-fg">
                  {asset.categoria.nombre}
                </dd>
              </div>
              {/* SPEC 2.124: en pesos chilenos, opcional. */}
              <div>
                <dt className="text-sm text-fg-subtle">Valor</dt>
                <dd className="font-medium text-fg">{formatearClp(asset.valor)}</dd>
              </div>
              {/* SPEC 2.140: por que se dio de baja y cuando. */}
              {asset.estado === "baja" && (
                <>
                  <div>
                    <dt className="text-sm text-fg-subtle">Motivo de la baja</dt>
                    <dd className="font-medium text-fg">{asset.motivoBaja || "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-fg-subtle">Fecha de la baja</dt>
                    <dd className="font-medium text-fg">{formatearFecha(asset.fechaBaja, {}, "-")}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          {/* Especificaciones Técnicas */}
          {especificaciones && Object.keys(especificaciones).length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-fg mb-4">
                Especificaciones Técnicas
              </h2>
              <dl className="grid grid-cols-2 gap-4">
                {Object.entries(especificaciones).map(([key, value]) => (
                  <div key={key}>
                    <dt className="text-sm text-fg-subtle capitalize">{key}</dt>
                    <dd className="font-medium text-fg">{value || "-"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Observaciones */}
          {asset.observaciones && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-fg mb-4">
                Observaciones
              </h2>
              <p className="text-fg-muted whitespace-pre-wrap">
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
              <h2 className="text-lg font-semibold text-fg mb-4">
                Historial de Asignaciones
              </h2>
              <TablaAsignaciones vacio="Sin asignaciones" filas={filasAsignaciones} />
            </div>
          )}
        </div>

        {/* Sidebar - Compra e Historial */}
        <div className="space-y-6">
          {/* Only shown when the asset is linked to a purchase invoice;
              manually created or imported assets may have none. */}
          {asset.purchaseAssets.length > 0 && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-fg mb-4">
                {asset.purchaseAssets.length === 1 ? "Compra asociada" : "Compras asociadas"}
              </h2>
              <div className="space-y-4">
                {asset.purchaseAssets.map((pa) => (
                  <div key={pa.id} className="border border-line rounded-lg p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="font-medium text-fg">
                        Factura {pa.purchase.numeroFactura || "s/n"}
                      </p>
                      <Link
                        href={`/compras/${pa.purchase.id}`}
                        className="text-sm text-primary-700 hover:text-primary-900 whitespace-nowrap"
                      >
                        Ver compra
                      </Link>
                    </div>
                    <div className="space-y-1 text-sm text-fg-muted">
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
            <h2 className="text-lg font-semibold text-fg mb-4">
              Historial de Eventos
            </h2>
            {asset.history.length === 0 ? (
              <p className="text-fg-subtle text-center py-4">
                No hay eventos registrados
              </p>
            ) : (
              <div className="space-y-4">
                {asset.history.map((evento) => (
                  <div
                    key={evento.id}
                    className="relative pl-6 pb-4 border-l-2 border-line last:pb-0"
                  >
                    <div className="absolute -left-2 top-0 w-4 h-4 bg-primary-500 rounded-full" />
                    <div>
                      <p className="font-medium text-fg">
                        {tipoEventoLabels[evento.tipoEvento] || evento.tipoEvento}
                      </p>
                      <p className="text-sm text-fg-muted">{evento.descripcion}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-fg-subtle">
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
