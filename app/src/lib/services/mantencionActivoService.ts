import type { EstadoActivo, Prisma } from '@prisma/client';
import { estadoTrasMantencion } from '@/lib/constants/estadosActivo';
import type { PrismaTx } from '@/lib/services/assetHistoryService';

/**
 * Lo que una mantencion le hace al estado del equipo (SPEC 2.96). Programar
 * no lo cambia; Iniciar lo pasa a "En Mantención"; Completar como Reparado o
 * Cancelar la que esta en proceso lo devuelven a su estado de uso. Estas
 * funciones son el unico lugar que decide ese regreso.
 */

type ActivoEnMantencion = {
  id: string;
  estado: EstadoActivo;
  empleadoActualId: string | null;
};

/**
 * Deja en el historial el cierre de una mantencion y, si era la que estaba
 * en proceso (devolverEquipo) y el equipo sigue en mantencion, lo devuelve a
 * su estado de uso. Una pendiente nunca movio al equipo: cerrarla no lo toca,
 * aunque otra mantencion lo tenga en mantencion. Devuelve el estado nuevo,
 * o null si el equipo no cambio.
 */
export async function registrarSalidaDeMantencion(
  tx: PrismaTx,
  datos: {
    asset: ActivoEnMantencion;
    maintenanceId: string;
    descripcion: string;
    usuario: string;
    devolverEquipo: boolean;
    extra?: Prisma.JsonObject;
  }
): Promise<EstadoActivo | null> {
  const { asset } = datos;
  const nuevoEstado =
    datos.devolverEquipo && asset.estado === 'en_mantencion' ? estadoTrasMantencion(asset) : null;

  if (nuevoEstado) {
    await tx.asset.update({ where: { id: asset.id }, data: { estado: nuevoEstado } });
  }

  await tx.assetHistory.create({
    data: {
      assetId: asset.id,
      tipoEvento: 'mantencion',
      descripcion: datos.descripcion,
      datosAnteriores: nuevoEstado ? { estado: asset.estado } : undefined,
      datosNuevos: {
        ...(nuevoEstado ? { estado: nuevoEstado } : {}),
        maintenanceId: datos.maintenanceId,
        ...datos.extra,
      },
      usuarioSistema: datos.usuario,
    },
  });

  return nuevoEstado;
}

/**
 * Un equipo dado de baja no queda con otras mantenciones abiertas: se
 * cancelan, dejando el motivo.
 */
export async function cancelarAbiertasPorBaja(tx: PrismaTx, assetId: string, exceptoId?: string) {
  await tx.maintenance.updateMany({
    where: {
      assetId,
      estado: { in: ['pendiente', 'en_proceso'] },
      ...(exceptoId ? { id: { not: exceptoId } } : {}),
    },
    data: { estado: 'cancelada', resultado: 'Cancelada: el equipo se dio de baja' },
  });
}
