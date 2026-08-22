/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({ user: { email: 'sync-admin@example.com' } }),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/services/microsoftGraphService', () => ({
  checkConfiguration: jest.fn(() => ({ configured: true, missing: [] })),
  fetchMicrosoftUsers: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    employee: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

import { POST } from '@/app/api/microsoft-sync/route';
import { prisma } from '@/lib/prisma';
import { fetchMicrosoftUsers } from '@/lib/services/microsoftGraphService';

const microsoftUser = {
  microsoftId: 'entra-1',
  nombres: 'Ada',
  apellidoPaterno: 'Lovelace',
  apellidoMaterno: null,
  correo: 'ada@example.com',
  cargo: 'Analista',
  ubicacion: 'Santiago',
  telefonoContacto: null,
  jefatura: null,
  supervisor: null,
};

const employee = {
  id: 'employee-1',
  ...microsoftUser,
  rut: null,
  tipoContrato: 'externo',
  fechaIngreso: null,
  fechaTermino: null,
  estado: 'activo',
  origenMicrosoft: true,
  fechaEntregaEpp: null,
  fechaEntregaKit: null,
  proximaMantencionEpp: null,
  activosActuales: [],
};

function configureTx(updated = employee) {
  const historyCreate = jest.fn().mockResolvedValue({ id: 'history-1' });
  const tx = {
    employee: {
      create: jest.fn().mockResolvedValue(updated),
      update: jest.fn().mockResolvedValue(updated),
    },
    employeeHistory: { create: historyCreate },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(tx));
  return { tx, historyCreate };
}

describe('POST /api/microsoft-sync — historial por empleado', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('crea desde Microsoft y deja evento de creación dentro del tx', async () => {
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...microsoftUser, accountEnabled: true },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(null);
    const { tx, historyCreate } = configureTx();

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ creados: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.employee.create).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'creacion' }) })
    );
  });

  test('actualiza los datos cambiados con sync_microsoft en la misma transacción', async () => {
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...microsoftUser, cargo: 'Arquitecta', accountEnabled: true },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(employee);
    const { tx, historyCreate } = configureTx({ ...employee, cargo: 'Arquitecta' });

    await POST();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.employee.update).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'sync_microsoft' }) })
    );
  });

  test('audita el relink por correo aunque sólo cambie el identificador de Microsoft', async () => {
    const microsoftIdNuevo = 'entra-2-private-id';
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...microsoftUser, microsoftId: microsoftIdNuevo, accountEnabled: true },
    ]);
    (prisma.employee.findUnique as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(employee);
    const { tx, historyCreate } = configureTx({ ...employee, microsoftId: microsoftIdNuevo });

    const response = await POST();

    expect(await response.json()).toMatchObject({ actualizados: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ microsoftId: microsoftIdNuevo }) })
    );
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'sync_microsoft' }) })
    );

    const eventData = historyCreate.mock.calls[0][0].data;
    expect(JSON.stringify(eventData)).not.toContain(microsoftUser.microsoftId);
    expect(JSON.stringify(eventData)).not.toContain(microsoftIdNuevo);
  });

  test('desvincula una cuenta deshabilitada con un evento de estado', async () => {
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...microsoftUser, accountEnabled: false },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(employee);
    const { tx, historyCreate } = configureTx({ ...employee, estado: 'desvinculado' });

    await POST();

    expect(tx.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'desvinculado' }) })
    );
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'desvinculacion' }) })
    );
  });

  test('reactiva una cuenta Microsoft habilitada que estaba desvinculada', async () => {
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...microsoftUser, accountEnabled: true },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      ...employee,
      estado: 'desvinculado',
    });
    const { tx, historyCreate } = configureTx(employee);

    const response = await POST();

    expect(await response.json()).toMatchObject({ reactivados: 1 });
    expect(tx.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'activo' }) })
    );
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'reactivacion' }) })
    );
  });

  test('no abre transacción ni escribe historial cuando Microsoft no trae cambios', async () => {
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...microsoftUser, accountEnabled: true },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(employee);
    configureTx();

    const response = await POST();

    expect(await response.json()).toMatchObject({ actualizados: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
