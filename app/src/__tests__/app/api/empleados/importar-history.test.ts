/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({ user: { email: 'ti@example.com' } }),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: { sheet_to_json: jest.fn() },
  SSF: { parse_date_code: jest.fn() },
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    employee: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import * as XLSX from 'xlsx';
import { POST } from '@/app/api/empleados/importar/route';
import { prisma } from '@/lib/prisma';

const employee = {
  id: 'employee-1',
  rut: '12.345.678-5',
  nombres: 'Ada',
  apellidoPaterno: 'Lovelace',
  apellidoMaterno: null,
  correo: 'ada@example.com',
  cargo: null,
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

describe('POST /api/empleados/importar — historial', () => {
  test('crea cada empleado importado junto con su evidencia en una transacción', async () => {
    (XLSX.read as jest.Mock).mockReturnValue({
      SheetNames: ['Empleados'],
      Sheets: { Empleados: {} },
    });
    (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
      {
        RUT: '12.345.678-5',
        Nombre: 'Ada',
        'Apellido Paterno': 'Lovelace',
        Correo: 'ada@example.com',
        'Tipo Contrato': 'planta',
      },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.employee.create as jest.Mock).mockResolvedValue(employee);
    const historyCreate = jest.fn().mockResolvedValue({ id: 'history-1' });
    const tx = {
      employee: { create: jest.fn().mockResolvedValue(employee), update: jest.fn() },
      employeeHistory: { create: historyCreate },
    };
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(tx));

    const response = await POST({
      formData: jest.fn().mockResolvedValue({
        get: (key: string) =>
          key === 'file'
            ? {
                size: 20,
                type: 'application/vnd.ms-excel',
                name: 'empleados.xls',
                arrayBuffer: jest.fn(),
              }
            : 'Empleados',
      }),
    } as never);

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.employee.create).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'creacion' }) })
    );
  });
});
