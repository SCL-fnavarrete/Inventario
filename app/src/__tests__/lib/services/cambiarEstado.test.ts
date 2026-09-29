/**
 * @jest-environment node
 */
// Unico camino para cambiar el estado de un equipo (SPEC 2.118).
jest.mock('@/shared/prisma', () => ({ prisma: {} }));

import { cambiarEstado } from '@/modules/activos/servicio';
import type { Prisma } from '@prisma/client';

function txFalso(filas = 1) {
  return {
    asset: { updateMany: jest.fn().mockResolvedValue({ count: filas }) },
    assetHistory: { create: jest.fn() },
  };
}
const comoTx = (tx: ReturnType<typeof txFalso>) => tx as unknown as Prisma.TransactionClient;

test('cambia el estado solo si el equipo sigue como se leyó, junto con sus datos', async () => {
  const tx = txFalso();
  await cambiarEstado(comoTx(tx), {
    activo: { id: 'a1', estado: 'disponible' },
    a: 'asignado',
    datos: { empleadoActualId: 'e1' },
  });
  expect(tx.asset.updateMany).toHaveBeenCalledWith({
    where: { id: 'a1', estado: 'disponible', deletedAt: null },
    data: { empleadoActualId: 'e1', estado: 'asignado' },
  });
});

test('una transición que la máquina de estados no permite responde 409 y no escribe', async () => {
  const tx = txFalso();
  await expect(
    cambiarEstado(comoTx(tx), { activo: { id: 'a1', estado: 'vendido' }, a: 'disponible' })
  ).rejects.toMatchObject({ status: 409 });
  expect(tx.asset.updateMany).not.toHaveBeenCalled();
});

test('respeta las precondiciones: una baja sin motivo se rechaza', async () => {
  const tx = txFalso();
  await expect(
    cambiarEstado(comoTx(tx), { activo: { id: 'a1', estado: 'disponible' }, a: 'baja' })
  ).rejects.toThrow(/motivo/);
});

test('si otro lo cambió en el intertanto (0 filas), responde 409 con el mensaje indicado', async () => {
  const tx = txFalso(0);
  await expect(
    cambiarEstado(comoTx(tx), {
      activo: { id: 'a1', estado: 'por_repartir' },
      a: 'disponible',
      mensajeConflicto: 'Cambió mientras se repartía',
    })
  ).rejects.toMatchObject({ status: 409, message: 'Cambió mientras se repartía' });
  expect(tx.assetHistory.create).not.toHaveBeenCalled();
});

test('las condiciones extra también deben seguir iguales', async () => {
  const tx = txFalso();
  await cambiarEstado(comoTx(tx), {
    activo: { id: 'a1', estado: 'baja' },
    a: 'vendido',
    contexto: { motivo: 'Venta a Juan' },
    exigir: { empleadoActualId: null },
  });
  expect(tx.asset.updateMany.mock.calls[0][0].where).toEqual({
    id: 'a1',
    estado: 'baja',
    deletedAt: null,
    empleadoActualId: null,
  });
});

test('el mismo estado no es una transición: solo guarda los datos', async () => {
  const tx = txFalso();
  await cambiarEstado(comoTx(tx), { activo: { id: 'a1', estado: 'no_devuelto' }, a: 'no_devuelto' });
  expect(tx.asset.updateMany).toHaveBeenCalledTimes(1);
});

test('anota el historial con el equipo, en la misma transacción', async () => {
  const tx = txFalso();
  await cambiarEstado(comoTx(tx), {
    activo: { id: 'a1', estado: 'en_transito' },
    a: 'disponible',
    historial: { tipoEvento: 'traslado', descripcion: 'Llegó a Concepción', usuarioSistema: 'qa' },
  });
  expect(tx.assetHistory.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ assetId: 'a1', tipoEvento: 'traslado', descripcion: 'Llegó a Concepción' }),
  });
});
