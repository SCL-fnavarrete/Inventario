"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";
import { ChevronRight, Cpu, Edit, Eye, HardDrive, MapPin, Package, PowerOff, Shield, User } from "lucide-react";
import type { CondicionActivo, EstadoActivo } from "@prisma/client";
import { cn } from "@/shared/cn";
import { formatearFecha } from "@/shared/utilidades/fechas";
import { Can } from "@/shared/ui/Can";
import { TablaDatos, type ColumnaDatos } from "@/shared/ui/TablaDatos";
import { identificadorActivo, motivoSinBaja, textoLineas } from "@/modules/activos";
import { CategoryIcon } from "@/modules/activos/componentes/CategoryIcon";
import { AssetConditionBadge, AssetStatusBadge } from "@/modules/activos/componentes/BadgesActivo";

/** Un equipo como lo trae la lista de Activos. */
export type ActivoFila = {
  id: string;
  marca: { nombre: string };
  modelo: string;
  numeroSerie: string | null;
  estado: EstadoActivo;
  condicion: CondicionActivo;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: { nombre: string } | null;
  microsoft365: boolean;
  intuneEnrolled: boolean;
  fechaCompra: Date | null;
  fechaGarantiaFin: Date | null;
  imei: string | null;
  lineas?: { numero: string }[];
  categoria: { id: string; nombre: string };
  sede: { id: string; nombre: string } | null;
  empleadoActual: {
    id: string;
    nombres: string;
    apellidoPaterno: string;
    correoEmpresa: string;
    correoPersonal?: string | null;
    cargo: string | null;
  } | null;
};

const SIN_DATO = <p className="text-sm text-fg-subtle">-</p>;

const COLUMNAS: ColumnaDatos<ActivoFila>[] = [
  {
    titulo: "Tipo",
    sinSalto: true,
    celda: (a) => (
      <div className="flex items-center gap-2 text-fg-muted">
        <CategoryIcon categoria={a.categoria.nombre} className="h-5 w-5" />
        <span className="text-sm font-medium">{a.categoria.nombre}</span>
      </div>
    ),
  },
  {
    titulo: "N° Serie",
    sinSalto: true,
    celda: (a) => (
      <div>
        <Link href={`/activos/${a.id}`} className="text-sm font-medium text-fg hover:text-primary-700 hover:underline">
          {identificadorActivo(a, "-")}
        </Link>
        {a.imei && <p className="text-xs text-fg-subtle">IMEI: {a.imei}</p>}
      </div>
    ),
  },
  {
    // Marca y modelo en dos lineas para que la tabla quepa.
    titulo: "Marca/Modelo",
    className: "min-w-[9rem]",
    celda: (a) => (
      <div>
        <Link href={`/activos/${a.id}`} className="block text-sm font-medium text-fg hover:text-primary-700 hover:underline">
          {a.marca.nombre}
        </Link>
        <p className="text-xs text-fg-subtle">{a.modelo}</p>
      </div>
    ),
  },
  { titulo: "Estado", sinSalto: true, celda: (a) => <AssetStatusBadge status={a.estado} size="sm" /> },
  { titulo: "Condición", sinSalto: true, celda: (a) => <AssetConditionBadge condicion={a.condicion} /> },
  {
    titulo: "Asignado a",
    celda: (a) =>
      a.empleadoActual ? (
        // 13rem: con max-w-xs la columna reservaba 320px y la tabla no cabia; un nombre largo se corta con "...".
        <div className="max-w-[13rem]">
          <Link
            href={`/empleados/${a.empleadoActual.id}`}
            className="block truncate text-sm font-medium text-fg transition-colors hover:text-primary-700 hover:underline"
            title="Ver ficha del empleado"
          >
            {a.empleadoActual.nombres} {a.empleadoActual.apellidoPaterno}
          </Link>
          {a.empleadoActual.cargo && <p className="truncate text-xs text-fg-subtle">{a.empleadoActual.cargo}</p>}
        </div>
      ) : (
        <p className="text-sm text-fg-subtle">Sin asignar</p>
      ),
  },
  {
    titulo: "Especificaciones",
    celda: (a) => (
      <div className="max-w-xs space-y-1">
        {a.procesador && (
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            <Cpu size={12} className="flex-shrink-0" />
            <span className="truncate">{a.procesador}</span>
          </div>
        )}
        {(a.ram || a.discoDuro) && (
          <div className="flex items-center gap-1 text-xs text-fg-muted">
            <HardDrive size={12} className="flex-shrink-0" />
            <span className="truncate">{[a.ram, a.discoDuro].filter(Boolean).join(" / ")}</span>
          </div>
        )}
        {a.sistemaOperativo && <p className="truncate text-xs text-fg-subtle">{a.sistemaOperativo.nombre}</p>}
        {!a.procesador && !a.ram && !a.discoDuro && !a.sistemaOperativo && <p className="text-xs text-fg-subtle">-</p>}
      </div>
    ),
  },
  {
    titulo: "Sede",
    sinSalto: true,
    celda: (a) =>
      a.sede?.nombre ? (
        <div className="flex items-center gap-1 text-sm text-fg-muted">
          <MapPin size={14} className="text-fg-subtle" />
          <span>{a.sede.nombre}</span>
        </div>
      ) : (
        SIN_DATO
      ),
  },
];

/** Una casilla "Sí / No" del detalle de la fila. */
function SiNo({ valor }: { valor: boolean }) {
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", valor ? "bg-green-50 text-green-700" : "bg-surface-muted text-fg-muted")}>
      {valor ? "Sí" : "No"}
    </span>
  );
}

function Dato({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-fg-subtle">{nombre}:</dt>
      <dd className="text-fg">{children}</dd>
    </div>
  );
}

/** Lo que se ve al expandir una fila: datos generales, la persona y el software. */
function DetalleActivo({ asset }: { asset: ActivoFila }) {
  const persona = asset.empleadoActual;
  return (
    <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-2">
        <h4 className="flex items-center gap-2 font-semibold text-fg-muted">
          <Package size={16} />
          Información General
        </h4>
        <dl className="space-y-1">
          <Dato nombre="Categoría">
            <span className="font-medium">{asset.categoria.nombre}</span>
          </Dato>
          <Dato nombre="Condición">
            <AssetConditionBadge condicion={asset.condicion} />
          </Dato>
          {asset.fechaCompra && <Dato nombre="Fecha de compra">{formatearFecha(asset.fechaCompra)}</Dato>}
          {asset.fechaGarantiaFin && <Dato nombre="Garantía hasta">{formatearFecha(asset.fechaGarantiaFin)}</Dato>}
          {!!asset.lineas?.length && <Dato nombre="Línea">{textoLineas(asset.lineas)}</Dato>}
        </dl>
      </div>

      {persona && (
        <div className="space-y-2">
          <h4 className="flex items-center gap-2 font-semibold text-fg-muted">
            <User size={16} />
            Usuario Asignado
          </h4>
          <dl className="space-y-1">
            <Dato nombre="Nombre">
              <span className="font-medium">
                {persona.nombres} {persona.apellidoPaterno}
              </span>
            </Dato>
            {persona.cargo && <Dato nombre="Cargo">{persona.cargo}</Dato>}
            <Dato nombre="Email">
              <span className="block max-w-[200px] truncate">{persona.correoEmpresa ?? persona.correoPersonal ?? ""}</span>
            </Dato>
          </dl>
          <Link
            href={`/empleados/${persona.id}`}
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
          >
            Ver ficha completa
            <ChevronRight size={14} />
          </Link>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="flex items-center gap-2 font-semibold text-fg-muted">
          <Shield size={16} />
          Software y Gestión
        </h4>
        <dl className="space-y-1">
          <Dato nombre="Microsoft 365">
            <SiNo valor={asset.microsoft365} />
          </Dato>
          <Dato nombre="Intune">
            <SiNo valor={asset.intuneEnrolled} />
          </Dato>
          {asset.sede?.nombre && <Dato nombre="Sede">{asset.sede.nombre}</Dato>}
        </dl>
      </div>
    </div>
  );
}

/** La lista de equipos de Activos: tabla comun con filas que se expanden. */
export function TablaActivos({
  assets,
  loading,
  paginacion,
}: {
  assets: ActivoFila[];
  loading: boolean;
  paginacion: ComponentProps<typeof TablaDatos<ActivoFila>>["paginacion"];
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const alternar = (a: ActivoFila) =>
    setAbiertas((prev) => {
      const nuevo = new Set(prev);
      if (!nuevo.delete(a.id)) nuevo.add(a.id);
      return nuevo;
    });

  return (
    <TablaDatos
      items={assets}
      clave={(a) => a.id}
      columnas={COLUMNAS}
      cargando={loading}
      vacio="No se encontraron activos"
      compacta
      alinearArriba
      expandible={{ abierta: (a) => abiertas.has(a.id), alternar, contenido: (a) => <DetalleActivo asset={a} /> }}
      acciones={(a) => (
        <>
          <Link
            href={`/activos/${a.id}`}
            className="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-primary-50 hover:text-primary-700"
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <Eye size={16} />
          </Link>
          <Link
            href={`/activos/${a.id}/editar`}
            className="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-green-50 hover:text-green-600"
            title="Editar"
            aria-label="Editar"
          >
            <Edit size={16} />
          </Link>
          {/* Dar de baja (SPEC 2.140): solo si el equipo se puede dar de baja (sin persona, ni de baja ni vendido). */}
          {!motivoSinBaja({ estado: a.estado, empleadoActualId: a.empleadoActual?.id ?? null }) && (
            <Can recurso="activos">
              <Link
                href={`/activos/${a.id}/baja`}
                className="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-red-50 hover:text-red-600"
                title="Dar de baja"
                aria-label="Dar de baja"
              >
                <PowerOff size={16} />
              </Link>
            </Can>
          )}
        </>
      )}
      paginacion={paginacion}
    />
  );
}
