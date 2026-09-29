"use client";

import { forwardRef } from "react";
import type { CondicionActivo, EstadoActivo } from "@prisma/client";
import { cn } from "@/shared/cn";
import { Badge, type BadgeProps, type BadgeSize } from "@/shared/ui/Badge";
import {
  CONDICION_ACTIVO_BADGE,
  CONDICION_ACTIVO_LABEL,
  ESTADO_ACTIVO_BADGE,
  ESTADO_ACTIVO_LABEL,
} from "@/modules/activos/estados";

export function getStatusLabel(status: EstadoActivo | string): string {
  return ESTADO_ACTIVO_LABEL[status as EstadoActivo] ?? status;
}

/** Estado del ciclo de vida de un activo, con el color del sistema. */
export const AssetStatusBadge = forwardRef<
  HTMLSpanElement,
  Omit<BadgeProps, "variant" | "children"> & { status: EstadoActivo | string }
>(({ status, className, ...props }, ref) => (
  <Badge ref={ref} dot className={cn(ESTADO_ACTIVO_BADGE[status as EstadoActivo], className)} {...props}>
    {getStatusLabel(status)}
  </Badge>
));

AssetStatusBadge.displayName = "AssetStatusBadge";

/**
 * Condicion fisica de un activo (nuevo / usado / danado). Acepta string
 * porque algunos selectores tipan la condicion como texto; un valor
 * desconocido cae al badge neutro con el valor tal cual.
 */
export function AssetConditionBadge({
  condicion,
  size = "sm",
}: {
  condicion: CondicionActivo | string;
  size?: BadgeSize;
}) {
  const clave = condicion as CondicionActivo;
  return (
    <Badge size={size} className={CONDICION_ACTIVO_BADGE[clave]}>
      {CONDICION_ACTIVO_LABEL[clave] ?? condicion}
    </Badge>
  );
}
