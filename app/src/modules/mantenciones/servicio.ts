import type { EstadoActivo, EstadoMantencion, Prisma } from '@prisma/client';
import { siSigueIgual } from '@/shared/utilidades/concurrencia';
import { estadoTrasMantencion } from '@/modules/activos/estados';
import { assetHistoryService } from '@/modules/activos/historial';
import { auditLogService } from '@/shared/auditoria';
import { mantencionACerrar } from '@/modules/mantenciones/utilidades';
import type { PrismaTx } from '@/modules/activos/historial';

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
    await siSigueIgual(
      tx.asset.update({ where: { id: asset.id, estado: 'en_mantencion' }, data: { estado: nuevoEstado } })
    );
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

/**
 * Tipo de mantencion para lo que no viene de una programada: "Correctiva", o
 * el primer tipo activo si ese no existe. Lo usan la devolucion dañada
 * (SPEC 2.87) y el equipo perdido en un despacho (SPEC 2.108).
 */
export async function tipoCorrectivaPorDefecto(tx: PrismaTx) {
  return (
    (await tx.maintenanceType.findFirst({ where: { nombre: 'Correctiva', activo: true } })) ??
    (await tx.maintenanceType.findFirst({ where: { activo: true }, orderBy: { nombre: 'asc' } }))
  );
}

type MantencionAbierta = { id: string; estado: EstadoMantencion; tipo: { id: string; nombre: string } };

/**
 * Los pasos de dar de baja un equipo (SPEC 2.88), dentro de una transaccion
 * ya abierta. Toda baja queda como una mantencion "Sin reparación": se cierra
 * la que corresponde (en proceso o la pendiente mas antigua) o, si no hay, se
 * registra una ya cerrada del tipo indicado; las demas abiertas se cancelan.
 * Quien llama ya valido que se puede (motivoSinBaja, validateTransition).
 * La usan la baja por Mantenciones y el equipo perdido en una guia.
 */
export async function darDeBajaEnTransaccion(
  tx: PrismaTx,
  datos: {
    asset: {
      id: string;
      estado: EstadoActivo;
      marca: string;
      modelo: string;
      condicion: string;
      maintenances: MantencionAbierta[];
    };
    /** Tipo si no hay mantencion abierta que cerrar. */
    tipo: { id: string; nombre: string };
    /** De motivoParaBaja: el motivo de la lista y su texto (SPEC 2.116.5). */
    motivoBajaId: string;
    motivoTexto: string;
    resultado: string;
    fechaRealizada: Date;
    realizadoPor: string;
    usuario: string;
    /** Descripcion de la mantencion nueva si no habia una abierta. */
    descripcion?: string;
  }
) {
  const { asset, motivoTexto, usuario } = datos;
  const abierta = mantencionACerrar(asset.maintenances);
  const tipo = abierta ? abierta.tipo : datos.tipo;
  const cierre = {
    estado: 'completada' as const,
    fechaRealizada: datos.fechaRealizada,
    realizadoPor: datos.realizadoPor,
    resultado: datos.resultado,
    resultadoTipo: 'no_reparable',
    motivoBajaId: datos.motivoBajaId,
    motivoBaja: motivoTexto,
  };

  // Cada escritura exige el estado que se leyo (siSigueIgual): una baja
  // simultanea con una entrega u otra baja responde 409 (7.A-1).
  const m = abierta
    ? await siSigueIgual(
        tx.maintenance.update({ where: { id: abierta.id, estado: abierta.estado }, data: cierre })
      )
    : await tx.maintenance.create({
        data: {
          assetId: asset.id,
          tipoId: tipo.id,
          descripcion: datos.descripcion ?? `Dar de baja: ${motivoTexto}`,
          fechaProgramada: datos.fechaRealizada,
          ...cierre,
        },
      });

  // Un equipo de baja no queda con otras mantenciones pendientes.
  await cancelarAbiertasPorBaja(tx, asset.id, m.id);

  await siSigueIgual(
    tx.asset.update({
      where: { id: asset.id, estado: asset.estado, empleadoActualId: null },
      data: { estado: 'baja', fechaBaja: datos.fechaRealizada },
    })
  );

  await assetHistoryService.registrarBaja(
    asset.id,
    `Mantención ${tipo.nombre}: ${motivoTexto}`,
    asset.condicion,
    usuario,
    tx
  );

  if (abierta) {
    await auditLogService.registrarActualizacion(
      'mantencion',
      m.id,
      `Mantención ${tipo.nombre} cerrada como Sin reparación: ${asset.marca} ${asset.modelo} dado de baja`,
      { estado: abierta.estado },
      { estado: 'completada', resultadoTipo: 'no_reparable', motivoBaja: motivoTexto },
      usuario,
      tx
    );
  } else {
    await auditLogService.registrarCreacion(
      'mantencion',
      m.id,
      `Mantención de baja: ${tipo.nombre} para ${asset.marca} ${asset.modelo}`,
      { assetId: asset.id, tipoId: tipo.id, resultadoTipo: 'no_reparable', motivoBaja: motivoTexto },
      usuario,
      tx
    );
  }

  return m;
}
