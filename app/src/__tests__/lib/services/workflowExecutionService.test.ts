import type { Prisma } from '@prisma/client';
import {
  executeAssignment,
  executeReturn,
  executeTerminationReturn,
} from '@/lib/services/workflowExecutionService';

const firmaPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3pgAAAABJRU5ErkJggg==';

describe('executeAssignment', () => {
  test('detiene la entrega sin crear asignación cuando el CAS del activo no la puede reclamar', async () => {
    const assignmentCreate = jest.fn();
    const assetHistoryCreate = jest.fn();
    const tx = {
      asset: {
        findUnique: jest.fn().mockResolvedValue({ id: 'asset-1', estado: 'disponible', deletedAt: null, empleadoActualId: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      employee: { findUnique: jest.fn().mockResolvedValue({ id: 'employee-1', estado: 'activo' }) },
      assignment: { create: assignmentCreate },
      assetHistory: { create: assetHistoryCreate },
    } as unknown as Prisma.TransactionClient;

    await expect(executeAssignment(tx, {
      assetId: 'asset-1', employeeId: 'employee-1', fechaEntrega: new Date(), tipoMovimiento: 'ingreso',
      firmaEmpleadoEntrega: firmaPng, aceptaPoliticaUso: true,
    })).rejects.toThrow('cambió antes de asignarlo');

    expect(assignmentCreate).not.toHaveBeenCalled();
    expect(assetHistoryCreate).not.toHaveBeenCalled();
  });
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'employee-1', estado: 'activo', nombres: 'Ada', apellidoPaterno: 'Lovelace', rut: null,
        }),
      },
      assignment: { create: assignmentCreate },
      assetHistory: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;
    const eventTimestamp = new Date('2026-08-22T12:34:56.000Z');
    await executeAssignment(tx, {
      assetId: 'asset-1',
      employeeId: 'employee-1',
      fechaEntrega: new Date('2026-08-01T00:00:00.000Z'),
      tipoMovimiento: 'ingreso',
      firmaEmpleadoEntrega: firmaPng,
      aceptaPoliticaUso: true,
    }, { eventTimestamp });

    const createData = assignmentCreate.mock.calls[0][0].data;
    expect(createData.firmaEmpleadoEntrega).toBe(firmaPng);
    expect(createData.firmaEmpleadoEntregaEn).toBeInstanceOf(Date);
    expect(createData.firmaEmpleadoEntregaEn).toBe(eventTimestamp);
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
  test('rechaza devolución cruzada entre empleados antes de cualquier escritura', async () => {
    const assignmentUpdate = jest.fn();
    const assetUpdate = jest.fn();
    const tx = {
      assignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assignment-b', activo: true, employeeId: 'employee-b', assetId: 'asset-1',
          asset: { estado: 'asignado', empleadoActualId: 'employee-b', deletedAt: null },
          employee: { nombres: 'Beto', apellidoPaterno: 'B' },
        }),
        updateMany: assignmentUpdate,
      },
      asset: { updateMany: assetUpdate }, assetHistory: { create: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(executeReturn(tx, {
      assignmentId: 'assignment-b', fechaDevolucion: new Date(), estadoDevolucion: 'ok',
      firmaEmpleadoDevolucion: firmaPng, aceptaPoliticaUso: true,
    }, { expectedEmployeeId: 'employee-a' })).rejects.toThrow('no pertenece al empleado');

    expect(assignmentUpdate).not.toHaveBeenCalled();
    expect(assetUpdate).not.toHaveBeenCalled();
  });

  test('no toca el activo ni el historial cuando el CAS de la asignación pierde la contención', async () => {
    const assetUpdate = jest.fn();
    const historyCreate = jest.fn();
    const tx = {
      assignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assignment-1', activo: true, employeeId: 'employee-1', assetId: 'asset-1',
          asset: { estado: 'asignado', empleadoActualId: 'employee-1', deletedAt: null },
          employee: { nombres: 'Ada', apellidoPaterno: 'Lovelace' },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      asset: { updateMany: assetUpdate }, assetHistory: { create: historyCreate },
    } as unknown as Prisma.TransactionClient;

    await expect(executeReturn(tx, {
      assignmentId: 'assignment-1', fechaDevolucion: new Date(), estadoDevolucion: 'ok',
      firmaEmpleadoDevolucion: firmaPng, aceptaPoliticaUso: true,
    })).rejects.toThrow('cambió antes de devolverla');

    expect(assetUpdate).not.toHaveBeenCalled();
    expect(historyCreate).not.toHaveBeenCalled();
  });
  test('rechaza una asignación inactiva sin escribir devolución ni activo', async () => {
    const assignmentUpdate = jest.fn();
    const assetUpdate = jest.fn();
    const tx = {
      assignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assignment-1', activo: false, employeeId: 'employee-1', assetId: 'asset-1',
          asset: { estado: 'asignado', empleadoActualId: 'employee-1' },
          employee: { nombres: 'Ada', apellidoPaterno: 'Lovelace' },
        }),
        update: assignmentUpdate,
      },
      asset: { update: assetUpdate },
      assetHistory: { create: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(executeReturn(tx, {
      assignmentId: 'assignment-1', fechaDevolucion: new Date(), estadoDevolucion: 'ok',
      firmaEmpleadoDevolucion: firmaPng, aceptaPoliticaUso: true,
    })).rejects.toThrow('ya no está activa');

    expect(assignmentUpdate).not.toHaveBeenCalled();
    expect(assetUpdate).not.toHaveBeenCalled();
  });
  test('persiste firma de devolución con una fecha generada por el servidor', async () => {
    const assignmentUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      assignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'assignment-1', activo: true, employeeId: 'employee-1', assetId: 'asset-1', asset: { estado: 'asignado', empleadoActualId: 'employee-1', deletedAt: null },
          employee: { nombres: 'Ada', apellidoPaterno: 'Lovelace' },
        }),
        updateMany: assignmentUpdate,
      },
      asset: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
    estadoCelular: 'no_aplica' as const,
    estadoMonitor: 'no_aplica' as const,
    estadoKit: 'no_aplica' as const,
    recibidoPor: 'Técnico TI',
    lugarDevolucion: 'Santiago',
    firmaEmpleadoDevolucion: firmaPng,
    aceptaPoliticaUso: true as const,
  };

  function transactionForCategory(nombre: string, tipoDevolucion: string) {
    const assignmentUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const assetUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const assetHistoryCreate = jest.fn().mockResolvedValue({});
    const terminationUpdate = jest.fn().mockResolvedValue({ id: 'termination-1' });
    const assignmentRecord = {
      id: 'assignment-1',
      assetId: 'asset-1',
      employeeId: 'employee-1',
      activo: true,
      asset: {
        id: 'asset-1', estado: 'asignado', empleadoActualId: 'employee-1', deletedAt: null,
        categoria: { nombre, tipoDevolucion },
      },
      employee: { nombres: 'Ada', apellidoPaterno: 'Lovelace' },
    };
    const tx = {
      termination: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'termination-1',
          employeeId: 'employee-1',
          employee: {
            id: 'employee-1',
            nombres: 'Ada',
            apellidoPaterno: 'Lovelace',
            assignments: [assignmentRecord],
          },
        }),
        update: terminationUpdate,
      },
      assignment: { findUnique: jest.fn().mockResolvedValue(assignmentRecord), updateMany: assignmentUpdate },
      asset: { updateMany: assetUpdate },
      assetHistory: { create: assetHistoryCreate },
    } as unknown as Prisma.TransactionClient;

    return { tx, assignmentUpdate, assetUpdate };
  }

  test('clasifica como notebook una categoría renombrada a Laptop por su tipo estable', async () => {
    const { tx, assignmentUpdate, assetUpdate } = transactionForCategory('Laptop', 'notebook');

    await executeTerminationReturn(tx, { ...returnParams, estadoCelular: 'no_aplica', estadoMonitor: 'no_aplica' });

    expect(assignmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estadoDevolucion: 'danado' }),
      })
    );
    expect(assetUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'baja' }) })
    );
    const assignmentTimestamp = assignmentUpdate.mock.calls[0][0].data.firmaEmpleadoDevolucionEn;
    expect(assetUpdate.mock.calls[0][0].data.fechaBaja).toBe(assignmentTimestamp);
  });

  test('bloquea el cierre pendiente de un notebook activo sin escribir nada', async () => {
    const assignmentUpdate = jest.fn();
    const assetUpdate = jest.fn();
    const terminationUpdate = jest.fn();
    const tx = {
      termination: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'termination-1', employeeId: 'employee-1',
          employee: {
            id: 'employee-1', nombres: 'Ada', apellidoPaterno: 'Lovelace',
            assignments: [{
              id: 'assignment-1', assetId: 'asset-1', employeeId: 'employee-1', activo: true,
              asset: { id: 'asset-1', estado: 'asignado', empleadoActualId: 'employee-1', categoria: { nombre: 'Laptop', tipoDevolucion: 'notebook' } },
            }],
          },
        }),
        update: terminationUpdate,
      },
      assignment: { update: assignmentUpdate },
      asset: { update: assetUpdate },
      assetHistory: { create: jest.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(executeTerminationReturn(tx, { ...returnParams, estadoNotebook: 'pendiente' }))
      .rejects.toThrow('pendiente');

    expect(terminationUpdate).not.toHaveBeenCalled();
    expect(assignmentUpdate).not.toHaveBeenCalled();
    expect(assetUpdate).not.toHaveBeenCalled();
  });

  test('exige no_aplica cuando no existe un celular activo', async () => {
    const { tx, assignmentUpdate, assetUpdate } = transactionForCategory('Laptop', 'notebook');
    await expect(executeTerminationReturn(tx, { ...returnParams, estadoCelular: 'ok' }))
      .rejects.toThrow('no_aplica');
    expect(assignmentUpdate).not.toHaveBeenCalled();
    expect(assetUpdate).not.toHaveBeenCalled();
  });

  test('no clasifica como notebook una categoría llamada Notebook cuyo tipo es otro', async () => {
    const { tx, assignmentUpdate, assetUpdate } = transactionForCategory('Notebook', 'otro');

    await executeTerminationReturn(tx, {
      ...returnParams,
      estadoNotebook: 'no_aplica', estadoCelular: 'no_aplica', estadoMonitor: 'no_aplica',
    });

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

    await executeTerminationReturn(tx, {
      ...returnParams,
      estadoNotebook: 'no_aplica', estadoCelular: 'no_aplica', estadoMonitor: 'no_aplica',
    });

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
    const assignmentUpdate = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      termination: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'termination-1',
          employeeId: 'employee-1',
          employee: {
            id: 'employee-1',
            nombres: 'Ada', apellidoPaterno: 'Lovelace',
            assignments: ['asset-1', 'asset-2'].map((assetId, index) => ({
              id: `assignment-${index + 1}`,
              assetId,
              employeeId: 'employee-1', activo: true,
              asset: { id: assetId, estado: 'asignado', empleadoActualId: 'employee-1', deletedAt: null, categoria: { nombre: 'Laptop', tipoDevolucion: 'notebook' } },
            })),
          },
        }),
        update: jest.fn().mockResolvedValue({ id: 'termination-1' }),
      },
      assignment: {
        findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          const index = where.id.endsWith('2') ? 2 : 1;
          return Promise.resolve({
            id: where.id,
            assetId: `asset-${index}`,
            employeeId: 'employee-1',
            activo: true,
            asset: { id: `asset-${index}`, estado: 'asignado', empleadoActualId: 'employee-1', deletedAt: null },
            employee: { nombres: 'Ada', apellidoPaterno: 'Lovelace' },
          });
        }),
        updateMany: assignmentUpdate,
      },
      asset: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      assetHistory: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as Prisma.TransactionClient;

    await executeTerminationReturn(tx, { ...returnParams, estadoCelular: 'no_aplica', estadoMonitor: 'no_aplica' });

    const signatureUpdates = assignmentUpdate.mock.calls.map(([call]) => call.data);
    expect(signatureUpdates).toHaveLength(2);
    expect(signatureUpdates.every((data) => data.firmaEmpleadoDevolucion === firmaPng)).toBe(true);
    expect(signatureUpdates[0].firmaEmpleadoDevolucionEn).toBe(signatureUpdates[1].firmaEmpleadoDevolucionEn);
  });
});
