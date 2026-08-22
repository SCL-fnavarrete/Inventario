import type { Prisma } from '@prisma/client';
import { executeAssignment } from '@/lib/services/workflowExecutionService';

describe('executeAssignment', () => {
  test('rechaza un activo descartado como si no existiera', async () => {
    const tx = {
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'asset-descartado',
          estado: 'disponible',
          deletedAt: new Date('2026-08-20T00:00:00.000Z'),
          empleadoActualId: null,
        }),
        update: jest.fn().mockResolvedValue({}),
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
        create: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
      },
      assetHistory: {
        create: jest.fn().mockResolvedValue({}),
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
  });
});
