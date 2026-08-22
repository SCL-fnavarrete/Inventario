/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({}),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: { employee: { findUnique: jest.fn() } },
}));

import { GET } from '@/app/api/empleados/[id]/ficha/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

describe('GET /api/empleados/[id]/ficha — historial', () => {
  test('incluye el historial newest-first y no expone identificadores Microsoft del snapshot', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
      id: 'employee-1',
      rut: null,
      nombres: 'Ada',
      apellidoPaterno: 'Lovelace',
      apellidoMaterno: null,
      correo: 'ada@example.com',
      cargo: null,
      jefatura: null,
      supervisor: null,
      ubicacion: null,
      tipoContrato: 'externo',
      fechaIngreso: null,
      fechaTermino: null,
      estado: 'activo',
      telefonoContacto: null,
      origenMicrosoft: true,
      fechaEntregaKit: null,
      fechaEntregaEpp: null,
      proximaMantencionEpp: null,
      assignments: [],
      kitAssignments: [],
      activosActuales: [],
      historial: [
        {
          id: 'history-new',
          tipoEvento: 'sync_microsoft',
          descripcion: 'Datos sincronizados desde Microsoft',
          usuarioSistema: 'sync-admin@example.com',
          createdAt: new Date('2026-08-22T12:00:00.000Z'),
          datosAnteriores: { cargo: 'Analista', microsoftId: 'private-id' },
          datosNuevos: { cargo: 'Arquitecta', microsoftId: 'private-id' },
        },
      ],
    });

    const response = await GET(new NextRequest('http://localhost/api/empleados/employee-1/ficha'), {
      params: Promise.resolve({ id: 'employee-1' }),
    });

    await expect(response.json()).resolves.toMatchObject({
      historial: [
        {
          id: 'history-new',
          tipoEvento: 'sync_microsoft',
          datosNuevos: { cargo: 'Arquitecta' },
        },
      ],
    });
  });
});
