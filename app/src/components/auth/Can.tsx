'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import type { Accion, Recurso } from '@/lib/auth/permissions';

interface CanProps {
  /** Recurso de la matriz de permisos (SPEC 1.3). */
  recurso: Recurso;
  /** Acción a ejercer sobre el recurso. Por defecto, escritura. */
  accion?: Accion;
  /** Qué mostrar cuando el rol no alcanza. Por defecto, nada. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Muestra su contenido sólo si el rol de la sesión puede ejercer la acción.
 *
 * Envuelve botones de crear, editar y eliminar para que la interfaz y la API
 * salgan de la misma matriz. No es un control de seguridad: la autorización
 * real la hace `requirePermission` en el servidor. Esto sólo evita ofrecer
 * acciones que van a terminar en 403.
 *
 *   <Can recurso="activos" accion="delete">
 *     <Button onClick={eliminar}>Eliminar</Button>
 *   </Can>
 */
export function Can({ recurso, accion = 'write', fallback = null, children }: CanProps) {
  const { can, cargando } = usePermissions();

  // Mientras la sesión carga no se muestra la acción: es preferible que
  // aparezca un instante después a que aparezca y desaparezca.
  if (cargando || !can(recurso, accion)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
