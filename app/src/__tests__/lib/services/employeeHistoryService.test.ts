import type { Prisma } from '@prisma/client';

jest.mock('@/lib/prisma', () => ({
  prisma: {
    employeeHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { employeeHistoryService } from '@/lib/services/employeeHistoryService';

const employee = {
  id: 'employee-1',
  rut: '12.345.678-5',
  nombres: 'Ada',
  apellidoPaterno: 'Lovelace',
  apellidoMaterno: null,
  correo: 'ada@example.com',
  cargo: 'Analista',
  jefatura: null,
  supervisor: null,
  ubicacion: 'Santiago',
  tipoContrato: 'planta',
  fechaIngreso: new Date('2026-08-01T00:00:00.000Z'),
  fechaTermino: null,
  estado: 'activo',
  telefonoContacto: null,
  origenMicrosoft: true,
  microsoftId: 'entra-private-id',
  fechaEntregaEpp: null,
  fechaEntregaKit: null,
  proximaMantencionEpp: null,
};

describe('employeeHistoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('guarda creación mediante el cliente transaccional y con snapshot seguro', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'history-1' });
    const tx = {
      employeeHistory: { create },
    } as unknown as Prisma.TransactionClient;

    await employeeHistoryService.registrarCreacion(employee as never, 'admin@example.com', tx);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        employeeId: 'employee-1',
        tipoEvento: 'creacion',
        usuarioSistema: 'admin@example.com',
        datosNuevos: expect.objectContaining({ correo: 'ada@example.com', estado: 'activo' }),
      }),
    });
    expect(create.mock.calls[0][0].data.datosNuevos).not.toHaveProperty('microsoftId');
    expect(prisma.employeeHistory.create).not.toHaveBeenCalled();
  });

  test('rechaza eventos sin actor auditable', async () => {
    const tx = { employeeHistory: { create: jest.fn() } } as unknown as Prisma.TransactionClient;

    await expect(
      employeeHistoryService.registrarCreacion(employee as never, '   ', tx)
    ).rejects.toThrow('actor');
  });

  test.each([
    { microsoftId: 'entra-private-id' },
    { campoNoPermitido: 'no debe persistirse' },
  ])('rechaza claves sensibles o desconocidas del escritor genérico: %o', async (snapshot) => {
    const create = jest.fn();
    const tx = { employeeHistory: { create } } as unknown as Prisma.TransactionClient;

    await expect(
      employeeHistoryService.registrar(
        {
          employeeId: employee.id,
          tipoEvento: 'sync_microsoft',
          descripcion: 'Intento de snapshot no seguro',
          datosNuevos: snapshot,
          usuarioSistema: 'admin@example.com',
        },
        tx
      )
    ).rejects.toThrow(/snapshot|permitida/i);

    expect(create).not.toHaveBeenCalled();
  });

  test('obtiene el historial más reciente primero', async () => {
    (prisma.employeeHistory.findMany as jest.Mock).mockResolvedValue([]);

    await employeeHistoryService.obtenerHistorial('employee-1');

    expect(prisma.employeeHistory.findMany).toHaveBeenCalledWith({
      where: { employeeId: 'employee-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
