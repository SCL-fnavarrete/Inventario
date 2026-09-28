/**
 * @jest-environment node
 */
// Motivos de baja como lista administrable (SPEC 2.116.5).
jest.mock('@/lib/prisma', () => ({
  prisma: {
    motivoBaja: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}));
jest.mock('@/lib/services/auditLogService', () => ({
  auditLogService: { registrarEliminacion: jest.fn() },
}));

import { prisma } from '@/lib/prisma';
import { eliminarMotivoBaja, motivoParaBaja } from '@/lib/services/motivoBajaService';

const db = prisma as unknown as {
  motivoBaja: Record<'findUnique' | 'findFirst' | 'update' | 'delete', jest.Mock>;
};
const motivo = (extra: object) => ({ id: 'm1', nombre: 'Robo', clave: null, _count: { maintenances: 0 }, ...extra });

beforeEach(() => jest.clearAllMocks());

describe('eliminar un motivo', () => {
  test('uno sin bajas se elimina', async () => {
    db.motivoBaja.findUnique.mockResolvedValue(motivo({}));
    expect(await eliminarMotivoBaja('m1')).toEqual({ desactivado: false });
    expect(db.motivoBaja.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
  });

  test('uno ya usado solo se desactiva: sus bajas son evidencia', async () => {
    db.motivoBaja.findUnique.mockResolvedValue(motivo({ _count: { maintenances: 3 } }));
    expect(await eliminarMotivoBaja('m1')).toEqual({ desactivado: true });
    expect(db.motivoBaja.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { activo: false } });
    expect(db.motivoBaja.delete).not.toHaveBeenCalled();
  });

  test('los que usa el sistema (Extravío, Otro) no se eliminan: 409', async () => {
    db.motivoBaja.findUnique.mockResolvedValue(motivo({ nombre: 'Extravío', clave: 'extravio' }));
    await expect(eliminarMotivoBaja('m1')).rejects.toMatchObject({ status: 409 });
    expect(db.motivoBaja.delete).not.toHaveBeenCalled();
    expect(db.motivoBaja.update).not.toHaveBeenCalled();
  });
});

describe('motivoParaBaja', () => {
  const cliente = prisma as never;

  test('guarda el id y arma el texto con el detalle', async () => {
    db.motivoBaja.findFirst.mockResolvedValue(motivo({}));
    expect(await motivoParaBaja(cliente, { id: 'm1' }, '  en la calle ')).toEqual({
      motivoBajaId: 'm1',
      motivoTexto: 'Robo: en la calle',
    });
    expect(await motivoParaBaja(cliente, { id: 'm1' })).toEqual({ motivoBajaId: 'm1', motivoTexto: 'Robo' });
  });

  test('"Otro" sin detalle: 400', async () => {
    db.motivoBaja.findFirst.mockResolvedValue(motivo({ nombre: 'Otro', clave: 'otro' }));
    await expect(motivoParaBaja(cliente, { id: 'm1' }, ' ')).rejects.toMatchObject({ status: 400 });
  });

  test('solo se aceptan motivos activos', async () => {
    db.motivoBaja.findFirst.mockResolvedValue(null);
    await expect(motivoParaBaja(cliente, { clave: 'extravio' }, 'x')).rejects.toMatchObject({ status: 400 });
    expect(db.motivoBaja.findFirst).toHaveBeenCalledWith({ where: { clave: 'extravio', activo: true } });
  });
});
