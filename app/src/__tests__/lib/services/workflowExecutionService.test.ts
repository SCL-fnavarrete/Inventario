import type { Prisma } from '@prisma/client';
import {
  executeAssignment,
  executeReturn,
  executeTerminationReturn,
} from '@/lib/services/workflowExecutionService';

const firmaPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3pgAAAABJRU5ErkJggg==';

describe('executeAssignment', () => {
  test('persiste firma de entrega con una fecha generada por el servidor', async () => {
    const assignmentCreate = jest.fn().mockResolvedValue({ id: 'assignment-1' });
    const tx = {
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'asset-1',
          estado: 'disponible',
          deletedAt: null,
          empleadoActualId: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-1', estado: 'activo', nombres: 'Ada', apellidoPaterno: 'Lovelace', rut: null,
        }),
      },
      assignment: { create: assignmentCreate },
      assetHistory: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;
    const before = new Date();

    await executeAssignment(tx, {
      assetId: 'asset-1',
      employeeId: 'employee-1',
      fechaEntrega: new Date('2026-08-01T00:00:00.000Z'),
      tipoMovimiento: 'ingreso',
      firmaEmpleadoEntrega: firmaPng,
      aceptaPoliticaUso: true,
    });

    const createData = assignmentCreate.mock.calls[0][0].data;
    expect(createData.firmaEmpleadoEntrega).toBe(firmaPng);
    expect(createData.firmaEmpleadoEntregaEn).toBeInstanceOf(Date);
    expect(createData.firmaEmpleadoEntregaEn.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

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
        firmaEmpleadoEntrega: firmaPng,
        aceptaPoliticaUso: true,
      })
    ).rejects.toThrow('Activo no encontrado');

    expect(assignmentCreate).not.toHaveBeenCalled();
    expect(assetUpdate).not.toHaveBeenCalled();
    expect(assetHistoryCreate).not.toHaveBeenCalled();
  });
});

describe('executeReturn', () => {
  test('persiste firma de devolución con una fecha generada por el servidor', async () => {
    const assignmentUpdate = jest.fn().mockResolvedValue({ id: 'assignment-1' });
    const tx = {
      assignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assignment-1', assetId: 'asset-1', asset: { estado: 'asignado', empleadoActualId: 'employee-1' },
          employee: { nombres: 'Ada', apellidoPaterno: 'Lovelace' },
        }),
        update: assignmentUpdate,
      },
      asset: { update: jest.fn().mockResolvedValue({}) },
      assetHistory: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    await executeReturn(tx, {
      assignmentId: 'assignment-1',
      fechaDevolucion: new Date('2026-08-01T00:00:00.000Z'),
      estadoDevolucion: 'ok',
      firmaEmpleadoDevolucion: firmaPng,
      aceptaPoliticaUso: true,
    });

    expect(assignmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firmaEmpleadoDevolucion: firmaPng,
          firmaEmpleadoDevolucionEn: expect.any(Date),
        }),
      })
    );
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
    firmaEmpleadoDevolucion: firmaPng,
    aceptaPoliticaUso: true as const,
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

  test('aplica una sola firma y timestamp de servidor a cada asignación de una devolución múltiple', async () => {
    const assignmentUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      termination: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'termination-1',
          employee: {
            nombres: 'Ada', apellidoPaterno: 'Lovelace',
            assignments: ['asset-1', 'asset-2'].map((assetId, index) => ({
              id: `assignment-${index + 1}`,
              assetId,
              asset: { id: assetId, estado: 'asignado', empleadoActualId: 'employee-1', categoria: { nombre: 'Laptop', tipoDevolucion: 'notebook' } },
            })),
          },
        }),
        update: jest.fn().mockResolvedValue({ id: 'termination-1' }),
      },
      assignment: { update: assignmentUpdate },
      asset: { update: jest.fn().mockResolvedValue({}) },
      assetHistory: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    await executeTerminationReturn(tx, returnParams);

    const signatureUpdates = assignmentUpdate.mock.calls.map(([call]) => call.data);
    expect(signatureUpdates).toHaveLength(2);
    expect(signatureUpdates.every((data) => data.firmaEmpleadoDevolucion === firmaPng)).toBe(true);
    expect(signatureUpdates[0].firmaEmpleadoDevolucionEn).toBe(signatureUpdates[1].firmaEmpleadoDevolucionEn);
  });
});
