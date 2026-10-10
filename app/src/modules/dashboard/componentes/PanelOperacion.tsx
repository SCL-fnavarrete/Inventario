import Link from "next/link";
import type { ReactNode } from "react";
import type { TipoEvento } from "@prisma/client";
import {
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardList,
  PackagePlus,
  Pencil,
  RefreshCw,
  ShoppingCart,
  Smartphone,
  Truck,
  Undo2,
  UserX,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/shared/cn";
import { TONO_ESTILO } from "@/shared/constantes/tonos";
import { tiempoRelativo } from "@/shared/utilidades/fechas";
import { EVENTO_ACTIVO } from "@/modules/dashboard/eventos";

/**
 * "Operacion": lo que el tecnico mira para saber que hacer y que paso: los
 * equipos que faltan por recuperar (los de quien se fue hace mas tiempo,
 * primero), lo ultimo que se hizo con los equipos y el estado de las lineas.
 */

const ICONO_EVENTO: Record<TipoEvento, ComponentType<{ className?: string }>> = {
  creacion: PackagePlus,
  asignacion: ArrowRightLeft,
  devolucion: Undo2,
  mantencion: Wrench,
  cambio_estado: RefreshCw,
  actualizacion_specs: Pencil,
  baja: XCircle,
  solicitud_workflow: ClipboardList,
  traslado: Truck,
  compra: ShoppingCart,
};

interface PanelOperacionProps {
  /** Total de equipos No devueltos (el panel muestra los primeros). */
  noDevueltos: number;
  pendientes: {
    id: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
    imei: string | null;
    updatedAt: Date;
    empleadoActual: { id: string; nombres: string; apellidoPaterno: string; fechaTermino: Date | null } | null;
  }[];
  actividad: {
    id: string;
    tipoEvento: TipoEvento;
    descripcion: string;
    usuarioSistema: string | null;
    createdAt: Date;
    asset: { id: string; marca: string; modelo: string; numeroSerie: string | null; imei: string | null };
  }[];
  lineas: { vigentes: number; disponibles: number; asignadas: number; esim: number; fisicas: number };
}

function Tarjeta({ titulo, ayuda, href, enlace, className, children }: { titulo: string; ayuda: string; href: string; enlace: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn("card flex flex-col p-5", className)} aria-label={titulo}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-fg">{titulo}</h2>
          <p className="text-xs text-fg-subtle">{ayuda}</p>
        </div>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-brand hover:underline">
          {enlace} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {children}
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-sm text-fg-subtle">
      <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden />
      {texto}
    </div>
  );
}

export function PanelOperacion({ noDevueltos, pendientes, actividad, lineas }: PanelOperacionProps) {
  const pctEsim = lineas.vigentes ? Math.round((lineas.esim / lineas.vigentes) * 100) : 0;
  const pctAsignadas = lineas.vigentes ? Math.round((lineas.asignadas / lineas.vigentes) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
      <Tarjeta
        titulo="Pendientes de devolución"
        ayuda={noDevueltos > pendientes.length ? `Los ${pendientes.length} de quien se fue hace más tiempo, de ${noDevueltos}.` : "Equipos que se quedó alguien que ya no está."}
        href="/activos?estado=no_devuelto"
        enlace="Ver todos"
      >
        {pendientes.length === 0 ? (
          <Vacio texto="No hay equipos por recuperar." />
        ) : (
          <ul className="divide-y divide-line">
            {pendientes.map((e) => (
              <li key={e.id}>
                <Link href={`/activos/${e.id}`} className="flex items-center gap-3 rounded-control py-2.5 hover:bg-surface-muted">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", TONO_ESTILO.orange.icono)}>
                    <UserX className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {e.marca} {e.modelo}
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {e.empleadoActual ? `${e.empleadoActual.nombres} ${e.empleadoActual.apellidoPaterno}` : "Sin persona"}
                      {e.numeroSerie || e.imei ? ` · ${e.numeroSerie ?? e.imei}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle" title="Desde que se fue la persona">
                    {e.empleadoActual?.fechaTermino ? tiempoRelativo(e.empleadoActual.fechaTermino) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Actividad reciente" ayuda="Lo último que se hizo con los equipos." href="/activos" enlace="Ver equipos">
        {actividad.length === 0 ? (
          <Vacio texto="Todavía no hay movimientos." />
        ) : (
          <ul className="divide-y divide-line">
            {actividad.map((e) => {
              const evento = EVENTO_ACTIVO[e.tipoEvento];
              const Icono = ICONO_EVENTO[e.tipoEvento];
              return (
                <li key={e.id}>
                  <Link href={`/activos/${e.asset.id}`} className="flex items-center gap-3 rounded-control py-2 hover:bg-surface-muted">
                    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TONO_ESTILO[evento.tono].icono)}>
                      <Icono className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">
                        <b className="font-semibold">{evento.label}</b> · {e.asset.marca} {e.asset.modelo}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {e.descripcion}
                        {e.usuarioSistema ? ` · ${e.usuarioSistema}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-fg-subtle">{tiempoRelativo(e.createdAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>

      <Tarjeta titulo="Líneas telefónicas" ayuda="Las líneas activas y cuántas se pueden asignar." href="/activos/lineas" enlace="Ver líneas" className="lg:col-span-2 xl:col-span-1">
        <div className="grid grid-cols-2 gap-2 text-center">
          <Dato titulo="Activas" valor={lineas.vigentes} />
          <Dato titulo="Disponibles" valor={lineas.disponibles} tono="success" ayuda="sin persona" />
        </div>
        <div className="mt-5 space-y-4">
          <Barra titulo="Asignadas a una persona" detalle={`${lineas.asignadas} de ${lineas.vigentes} · ${pctAsignadas}%`} porcentaje={pctAsignadas} color="bg-primary-500" />
          <Barra titulo="eSIM (teléfono personal)" detalle={`${lineas.esim} eSIM · ${lineas.fisicas} chip físico`} porcentaje={pctEsim} color="bg-emerald-500" />
        </div>
        {lineas.vigentes > 0 && (
          <p className="mt-auto flex items-center gap-1.5 pt-5 text-xs text-fg-subtle">
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            Un chip físico va en un celular de la empresa; una eSIM, con una persona.
          </p>
        )}
      </Tarjeta>
    </div>
  );
}

function Dato({ titulo, valor, tono, ayuda }: { titulo: string; valor: number; tono?: "success" | "danger"; ayuda?: string }) {
  return (
    <div className="rounded-control bg-surface-muted px-2 py-3">
      <p className={cn("text-2xl font-bold", tono ? TONO_ESTILO[tono].valor : "text-fg")}>{valor.toLocaleString("es-CL")}</p>
      <p className="text-xs font-medium text-fg-muted">{titulo}</p>
      {ayuda && <p className="text-[11px] text-fg-subtle">{ayuda}</p>}
    </div>
  );
}

function Barra({ titulo, detalle, porcentaje, color }: { titulo: string; detalle: string; porcentaje: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span className="text-fg-muted">{titulo}</span>
        <span className="text-xs text-fg-subtle">{detalle}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label={titulo}>
        <div className={cn("h-full rounded-full", color)} style={{ width: `${porcentaje}%` }} />
      </div>
    </div>
  );
}
