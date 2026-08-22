'use client';

import { useSession } from 'next-auth/react';
import { useMemo } from 'react';
import {
  can as puede,
  recursosPermitidos,
  type Accion,
  type Recurso,
} from '@/lib/auth/permissions';

/**
 * Permisos del usuario en la UI, leidos de la MISMA matriz que usa la API.
 *
 * El objetivo es que la interfaz y el servidor no puedan discrepar: si un
 * boton aparece, la ruta detras lo va a aceptar; si no aparece, es porque la
 * ruta lo iba a rechazar con 403. Esto no reemplaza al guard del servidor
 * -- ocultar un boton no es autorizacion -- sino que evita que el usuario
 * descubra sus permisos a golpe de error.
 */
export function usePermissions() {
  const { data: session, status } = useSession();
  const rol = session?.user?.role;

  return useMemo(
    () => ({
      rol,
      cargando: status === 'loading',
      can: (recurso: Recurso, accion: Accion) => puede(rol, recurso, accion),
      puedeVer: (recurso: Recurso) => puede(rol, recurso, 'read'),
      puedeEditar: (recurso: Recurso) => puede(rol, recurso, 'write'),
      puedeEliminar: (recurso: Recurso) => puede(rol, recurso, 'delete'),
      recursosVisibles: () => recursosPermitidos(rol, 'read'),
    }),
    [rol, status]
  );
}
