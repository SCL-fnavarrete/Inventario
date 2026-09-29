// Lo que una mantencion le hace al estado del equipo (SPEC 2.96).
import {
  cancelarAbiertasPorBaja,
  registrarSalidaDeMantencion,
} from '@/modules/mantenciones/servicio';
import { estadoTrasMantencion } from '@/modules/activos/estados';
import type { PrismaTx } from '@/modules/activos/historial';

function txFalso() {
  return {
    asset: { update: jest.fn() },
    assetHistory: { create: jest.fn() },
    maintenance: { updateMany: jest.fn() },
  };
}

const enMantencion = { id: 'a1', estado: 'en_mantencion' as const, empleadoActualId: null };

describe('estadoTrasMantencion', () => {
  test('vuelve a asignado si tiene dueño, si no a disponible', () => {
    expect(estadoTrasMantencion({ empleadoActualId: 'e1' })).toBe('asignado');
    expect(estadoTrasMantencion({ empleadoActualId: null })).toBe('disponible');
  });
});

describe('registrarSalidaDeMantencion', () => {
  const base = { maintenanceId: 'm1', descripcion: 'Mantención cancelada', usuario: 'qa' };

  test('cerrar la que estaba en proceso devuelve el equipo y lo deja en el historial', async () => {
    const tx = txFalso();
    const nuevo = await registrarSalidaDeMantencion(tx as unknown as PrismaTx, {
      ...base,
      asset: enMantencion,
      devolverEquipo: true,
    });
    expect(nuevo).toBe('disponible');
    // Solo si sigue en mantencion (7.A-1): no pisa un cambio simultaneo.
    expect(tx.asset.update).toHaveBeenCalledWith({ where: { id: 'a1', estado: 'en_mantencion' }, data: { estado: 'disponible' } });
    expect(tx.assetHistory.create.mock.calls[0][0].data.datosNuevos).toEqual({
      estado: 'disponible',
      maintenanceId: 'm1',
    });
  });

  test('cerrar una pendiente no saca al equipo de la mantencion que tiene en proceso', async () => {
    const tx = txFalso();
    const nuevo = await registrarSalidaDeMantencion(tx as unknown as PrismaTx, {
      ...base,
      asset: enMantencion,
      devolverEquipo: false,
    });
    expect(nuevo).toBeNull();
    expect(tx.asset.update).not.toHaveBeenCalled();
    expect(tx.assetHistory.create).toHaveBeenCalledTimes(1);
  });

  test('un equipo que ya no esta en mantencion no cambia', async () => {
    const tx = txFalso();
    const nuevo = await registrarSalidaDeMantencion(tx as unknown as PrismaTx, {
      ...base,
      asset: { ...enMantencion, estado: 'asignado' },
      devolverEquipo: true,
    });
    expect(nuevo).toBeNull();
    expect(tx.asset.update).not.toHaveBeenCalled();
  });
});

describe('cancelarAbiertasPorBaja', () => {
  test('cancela las demas abiertas del equipo, sin tocar la que se cierra', async () => {
    const tx = txFalso();
    await cancelarAbiertasPorBaja(tx as unknown as PrismaTx, 'a1', 'm1');
    expect(tx.maintenance.updateMany).toHaveBeenCalledWith({
      where: { assetId: 'a1', estado: { in: ['pendiente', 'en_proceso'] }, id: { not: 'm1' } },
      data: { estado: 'cancelada', resultado: 'Cancelada: el equipo se dio de baja' },
    });
  });
});
