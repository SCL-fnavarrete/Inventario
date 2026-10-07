/**
 * @jest-environment node
 */
// Unico camino para cambiar el estado de un equipo (SPEC 2.118).
jest.mock('@/shared/prisma', () => ({ prisma: {} }));

import { cambiarEstado } from '@/modules/activos/servicio';
import type { Prisma } from '@prisma/client';

function txFalso(filas = 1, tenedorAntes: string | null = null) {
  return {
    asset: {
      updateMany: jest.fn().mockResolvedValue({ count: filas }),
      findUnique: jest.fn().mockResolvedValue({ empleadoActualId: tenedorAntes }),
    },
    assetHistory: { create: jest.fn() },
    // Las lineas que estan en el equipo anotan su tenencia (SPEC 2.131).
    lineaTelefonica: { findMany: jest.fn().mockResolvedValue([{ id: 'l1', responsable: null }]) },
    lineaTenencia: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn(), create: jest.fn() },
    // Bloqueo de cada linea antes de cambiar su tramo.
    $queryRaw: jest.fn().mockResolvedValue([]),
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

describe('cambio de quien tiene el equipo (SPEC 2.131)', () => {
  test('al entregarlo, sus líneas abren un tramo con la persona nueva', async () => {
    const tx = txFalso();
    await cambiarEstado(comoTx(tx), {
      activo: { id: 'a1', estado: 'disponible' },
      a: 'asignado',
      datos: { empleadoActualId: 'e1' },
      historial: { tipoEvento: 'asignacion', descripcion: 'Entregado a Ana' },
    });
    expect(tx.lineaTelefonica.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { activoId: 'a1', estado: { deBaja: false } } })
    );
    // La linea se bloquea antes de tocar su tramo: dos cambios a la vez no dejan dos abiertos.
    const [sql, id] = tx.$queryRaw.mock.calls[0];
    expect(sql.join('?')).toMatch(/FOR UPDATE/);
    expect(id).toBe('l1');
    expect(tx.lineaTenencia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lineaId: 'l1',
        activoId: 'a1',
        empleadoId: 'e1',
        origen: 'entrega_telefono',
        detalle: 'Entregado a Ana',
      }),
    });
  });

  test('al devolverlo, quedan sin persona y el tramo anterior se cierra', async () => {
    const tx = txFalso(1, 'e1');
    tx.lineaTenencia.findFirst.mockResolvedValue({ desde: new Date('2026-01-01') });
    await cambiarEstado(comoTx(tx), {
      activo: { id: 'a1', estado: 'asignado' },
      a: 'disponible',
      datos: { empleadoActualId: null },
    });
    expect(tx.lineaTenencia.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { lineaId: 'l1', hasta: null } })
    );
    expect(tx.lineaTenencia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lineaId: 'l1', empleadoId: null, origen: 'devolucion_telefono' }),
    });
  });

  test('si no cambia quien lo tiene, las líneas no se tocan', async () => {
    const tx = txFalso();
    await cambiarEstado(comoTx(tx), {
      activo: { id: 'a1', estado: 'disponible' },
      a: 'en_mantencion',
    });
    expect(tx.lineaTelefonica.findMany).not.toHaveBeenCalled();
    // Mismo dueno antes y despues (ej. un "no devuelto" que se vuelve a marcar).
    const igual = txFalso(1, 'e1');
    await cambiarEstado(comoTx(igual), {
      activo: { id: 'a1', estado: 'asignado' },
      a: 'asignado',
      datos: { empleadoActualId: 'e1' },
    });
    expect(igual.lineaTelefonica.findMany).not.toHaveBeenCalled();
  });
});
