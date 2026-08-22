/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({ user: { email: 'admin@example.com' } }),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
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

import { NextRequest } from 'next/server';
import { DELETE, PUT } from '@/app/api/empleados/[id]/route';
import { POST as createEmployee } from '@/app/api/empleados/route';
import { prisma } from '@/lib/prisma';

const originalEmployee = {
  id: 'employee-1',
  rut: '12.345.678-5',
  nombres: 'Ada',
  apellidoPaterno: 'Lovelace',
  apellidoMaterno: null,
  correo: 'ada@example.com',
  cargo: null as string | null,
  jefatura: null,
  supervisor: null,
  ubicacion: null,
  tipoContrato: 'planta',
  fechaIngreso: null,
  fechaTermino: null,
  estado: 'activo',
  telefonoContacto: null,
  origenMicrosoft: false,
  microsoftId: null,
  fechaEntregaEpp: null,
  fechaEntregaKit: null,
  proximaMantencionEpp: null,
};

function transactionReturning(updatedEmployee = originalEmployee) {
  const historyCreate = jest.fn().mockResolvedValue({ id: 'history-1' });
  const tx = {
    employee: {
      create: jest.fn().mockResolvedValue(updatedEmployee),
      update: jest.fn().mockResolvedValue(updatedEmployee),
    },
    employeeHistory: { create: historyCreate },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(tx));
  return { tx, historyCreate };
}

describe('rutas manuales de empleados — historial atómico', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.employee.create as jest.Mock).mockResolvedValue(originalEmployee);
    (prisma.employee.update as jest.Mock).mockResolvedValue(originalEmployee);
  });

  test('crea al empleado y su evento de creación en la misma transacción', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(null);
    const created = { ...originalEmployee, nombres: 'Grace' };
    const { tx, historyCreate } = transactionReturning(created);

    const response = await createEmployee(
      new NextRequest('http://localhost/api/empleados', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombres: 'Grace',
          apellidoPaterno: 'Hopper',
          correo: 'grace@example.com',
          tipoContrato: 'planta',
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.employee.create).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'creacion' }) })
    );
  });

  test('actualiza y deja snapshots before/after reales con el mismo tx', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(originalEmployee);
    const updated = { ...originalEmployee, cargo: 'Directora de TI' };
    const { tx, historyCreate } = transactionReturning(updated);

    const response = await PUT(
      new NextRequest('http://localhost/api/empleados/employee-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cargo: 'Directora de TI' }),
      }),
      { params: Promise.resolve({ id: 'employee-1' }) }
    );

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.employee.update).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tipoEvento: 'actualizacion',
          datosAnteriores: expect.objectContaining({ cargo: null }),
          datosNuevos: expect.objectContaining({ cargo: 'Directora de TI' }),
        }),
      })
    );
  });

  test('desactiva lógicamente y registra una desvinculación en el mismo tx', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      ...originalEmployee,
      assignments: [],
    });
    const { tx, historyCreate } = transactionReturning({
      ...originalEmployee,
      estado: 'desvinculado',
    });

    const response = await DELETE(new NextRequest('http://localhost/api/empleados/employee-1'), {
      params: Promise.resolve({ id: 'employee-1' }),
    });

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.employee.update).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'desvinculacion' }) })
    );
  });
});
