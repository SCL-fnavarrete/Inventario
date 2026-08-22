import type { Prisma } from '@prisma/client';
import {
  executeAssignment,
  executeTerminationReturn,
} from '@/lib/services/workflowExecutionService';

describe('executeAssignment', () => {
  test('rechaza un activo descartado como si no existiera', async () => {
    const assignmentCreate = jest.fn().mockResolvedValue({ id: 'assignment-1' });
    const assetUpdate = jest.fn().mockResolvedValue({});
    const assetHistoryCreate = jest.fn().mockResolvedValue({});
    const tx = {
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'asset-descartado',
          estado: 'disponible',
          deletedAt: new Date('2026-08-20T00:00:00.000Z'),
          empleadoActualId: null,
        }),
        update: assetUpdate,
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-1',
          estado: 'activo',
          nombres: 'Ada',
          apellidoPaterno: 'Lovelace',
          rut: null,
        }),
      },
      assignment: {
        create: assignmentCreate,
      },
      assetHistory: {
        create: assetHistoryCreate,
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      executeAssignment(tx, {
        assetId: 'asset-descartado',
        employeeId: 'employee-1',
        fechaEntrega: new Date('2026-08-21T00:00:00.000Z'),
        tipoMovimiento: 'ingreso',
      })
    ).rejects.toThrow('Activo no encontrado');

    expect(assignmentCreate).not.toHaveBeenCalled();
    expect(assetUpdate).not.toHaveBeenCalled();
    expect(assetHistoryCreate).not.toHaveBeenCalled();
  });
});

describe('executeTerminationReturn', () => {
  const returnParams = {
    terminationId: 'termination-1',
    fechaDevolucionEquipos: new Date('2026-08-21T00:00:00.000Z'),
    estadoNotebook: 'danado' as const,
    estadoCelular: 'danado' as const,
    estadoMonitor: 'danado' as const,
    estadoKit: 'pendiente' as const,
    recibidoPor: 'Técnico TI',
    lugarDevolucion: 'Santiago',
  };

  function transactionForCategory(nombre: string, tipoDevolucion: string) {
    const assignmentUpdate = jest.fn().mockResolvedValue({});
    const assetUpdate = jest.fn().mockResolvedValue({});
    const assetHistoryCreate = jest.fn().mockResolvedValue({});
    const terminationUpdate = jest.fn().mockResolvedValue({ id: 'termination-1' });
    const tx = {
      termination: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'termination-1',
          employee: {
            nombres: 'Ada',
            apellidoPaterno: 'Lovelace',
            assignments: [
              {
                id: 'assignment-1',
                assetId: 'asset-1',
                asset: {
                  id: 'asset-1',
                  estado: 'asignado',
                  empleadoActualId: 'employee-1',
                  categoria: { nombre, tipoDevolucion },
                },
              },
            ],
          },
        }),
        update: terminationUpdate,
      },
      assignment: { update: assignmentUpdate },
      asset: { update: assetUpdate },
      assetHistory: { create: assetHistoryCreate },
    } as unknown as Prisma.TransactionClient;

    return { tx, assignmentUpdate, assetUpdate };
  }

  test('clasifica como notebook una categoría renombrada a Laptop por su tipo estable', async () => {
    const { tx, assignmentUpdate, assetUpdate } = transactionForCategory('Laptop', 'notebook');

    await executeTerminationReturn(tx, returnParams);

    expect(assignmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoDevolucion: 'danado' }),
      })
    );
    expect(assetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'baja' }) })
    );
  });

  test('no clasifica como notebook una categoría llamada Notebook cuyo tipo es otro', async () => {
    const { tx, assignmentUpdate, assetUpdate } = transactionForCategory('Notebook', 'otro');

    await executeTerminationReturn(tx, returnParams);

    expect(assignmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoDevolucion: 'ok' }),
      })
    );
    expect(assetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'reutilizable' }) })
    );
  });

  test('no aplica los estados dañados de notebook, celular o monitor a una categoría otro', async () => {
    const { tx, assignmentUpdate, assetUpdate } = transactionForCategory('Docking Station', 'otro');

    await executeTerminationReturn(tx, returnParams);

    expect(assignmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoDevolucion: 'ok' }),
      })
    );
    expect(assetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'reutilizable' }) })
    );
  });
});
