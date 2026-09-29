import { CheckCircle, Clock, PackageSearch, Wrench, XCircle } from "lucide-react";
import { cn } from "@/shared/cn";
import { RESULTADO_MANTENCION_LABEL } from "@/modules/mantenciones/resultados";

type ConfigEstado = {
  label: string;
  icon: typeof CheckCircle;
  color: string;
  bgColor: string;
};

const ESTADO_MANTENCION: Record<string, ConfigEstado> = {
  pendiente: { label: "Pendiente", icon: Clock, color: "text-orange-600", bgColor: "bg-orange-100" },
  en_proceso: { label: "En Proceso", icon: Wrench, color: "text-primary-700", bgColor: "bg-primary-100" },
  completada: { label: "Completada", icon: CheckCircle, color: "text-green-600", bgColor: "bg-green-100" },
  cancelada: { label: "Cancelada", icon: XCircle, color: "text-fg-muted", bgColor: "bg-gray-100" },
};

// En proceso, en espera de repuestos (SPEC 2.96): sigue abierta.
const ESPERANDO_REPUESTOS: ConfigEstado = {
  label: RESULTADO_MANTENCION_LABEL.pendiente_repuestos,
  icon: PackageSearch,
  color: "text-amber-800",
  bgColor: "bg-amber-100",
};

/** Estados en el orden de la leyenda del calendario. */
export const LEYENDA_ESTADOS_MANTENCION: ConfigEstado[] = [
  ESTADO_MANTENCION.pendiente,
  ESTADO_MANTENCION.en_proceso,
  ESPERANDO_REPUESTOS,
  ESTADO_MANTENCION.completada,
  ESTADO_MANTENCION.cancelada,
];

/** Como se muestra el estado de una mantencion (listado, detalle, calendario). */
export function configEstadoMantencion(m: { estado: string; resultadoTipo?: string | null }): ConfigEstado {
  if (m.estado === "en_proceso" && m.resultadoTipo === "pendiente_repuestos") return ESPERANDO_REPUESTOS;
  return ESTADO_MANTENCION[m.estado] ?? ESTADO_MANTENCION.pendiente;
}

export function EstadoMantencionBadge({
  mantencion,
}: {
  mantencion: { estado: string; resultadoTipo?: string | null };
}) {
  const config = configEstadoMantencion(mantencion);
  const Icono = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap",
        config.bgColor,
        config.color
      )}
    >
      <Icono className="h-3 w-3" />
      {config.label}
    </span>
  );
}
