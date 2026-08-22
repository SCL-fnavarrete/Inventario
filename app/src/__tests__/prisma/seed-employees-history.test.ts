import { TipoContrato } from '@prisma/client';
import { seedEmployees } from '../../../prisma/seedEmployees';

const employeeInput = {
  rut: '12.345.678-9',
  nombres: 'Ada',
  apellidoPaterno: 'Lovelace',
  apellidoMaterno: null,
  correo: 'ada@example.com',
  cargo: 'Analista',
  jefatura: null,
  supervisor: null,
  ubicacion: 'Santiago',
  tipoContrato: TipoContrato.planta,
  fechaIngreso: new Date('2026-08-01T00:00:00.000Z'),
};

const createdEmployee = {
  ...employeeInput,
  id: 'employee-1',
  estado: 'activo',
  telefonoContacto: null,
  microsoftId: 'entra-private-id',
  origenMicrosoft: false,
  fechaTermino: null,
  fechaEntregaEpp: null,
  fechaEntregaKit: null,
  proximaMantencionEpp: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

function createSeedClient(existing: unknown) {
  const employeeCreate = jest.fn().mockResolvedValue(createdEmployee);
  const historyCreate = jest.fn().mockResolvedValue({ id: 'history-1' });
  const tx = {
    employee: { create: employeeCreate },
    employeeHistory: { create: historyCreate },
  };
  const transaction = jest.fn(async (callback) => callback(tx));

  return {
    client: {
      employee: { findUnique: jest.fn().mockResolvedValue(existing) },
      $transaction: transaction,
    },
    tx,
    transaction,
  };
}

describe('seedEmployees', () => {
  test('crea cada empleado inexistente y su evidencia en la misma transacción', async () => {
    const { client, tx, transaction } = createSeedClient(null);

    const created = await seedEmployees(client as never, [employeeInput]);

    expect(created).toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.employee.create).toHaveBeenCalledWith({ data: employeeInput });
    expect(tx.employeeHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: 'employee-1',
          tipoEvento: 'creacion',
          usuarioSistema: 'seed@sclconsultores.com',
          datosNuevos: expect.objectContaining({ estado: 'activo', correo: 'ada@example.com' }),
        }),
      })
    );

    const snapshot = (tx.employeeHistory.create as jest.Mock).mock.calls[0][0].data.datosNuevos;
    expect(snapshot).not.toHaveProperty('microsoftId');
    expect(tx.employee.create.mock.invocationCallOrder[0]).toBeLessThan(
      (tx.employeeHistory.create as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  test('no crea historial duplicado cuando el empleado de seed ya existe', async () => {
    const { client, tx, transaction } = createSeedClient(createdEmployee);

    const created = await seedEmployees(client as never, [employeeInput]);

    expect(created).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
    expect(tx.employee.create).not.toHaveBeenCalled();
    expect(tx.employeeHistory.create).not.toHaveBeenCalled();
  });
});
