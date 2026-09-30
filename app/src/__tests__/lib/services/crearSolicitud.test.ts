/**
 * @jest-environment node
 */
// Crear una solicitud (POST /api/solicitudes), ahora en modules/solicitudes/crear
// (SPEC 2.118): las reglas que se revisan antes de abrir la transaccion.
const mockDb = {
  employee: { findUnique: jest.fn() },
  assignment: { count: jest.fn() },
  welcomeKitItem: { findMany: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@/shared/prisma', () => ({
  get prisma() {
    return mockDb;
  },
}));

import { crearSolicitud } from '@/modules/solicitudes/crear';
import type { CreateWorkflowRequestInput } from '@/modules/solicitudes/validaciones';

const USUARIO = { id: 'u1', nombre: 'QA', usuario: 'qa' };
const solicitud = (d: object) => d as CreateWorkflowRequestInput;
const desvinculado = { id: 'e1', nombres: 'Ana', apellidoPaterno: 'Rojas', estado: 'desvinculado' };

beforeEach(() => jest.clearAllMocks());

test('un empleado que no existe: 404', async () => {
  mockDb.employee.findUnique.mockResolvedValue(null);
  await expect(
    crearSolicitud(
      solicitud({ tipo: 'cambio_equipo', employeeId: 'x', cambios: [] }),
      's1',
      USUARIO
    )
  ).rejects.toMatchObject({ status: 404, message: 'Empleado no encontrado' });
  expect(mockDb.$transaction).not.toHaveBeenCalled();
});

test('cambio de equipo para alguien desvinculado: 409', async () => {
  mockDb.employee.findUnique.mockResolvedValue(desvinculado);
  await expect(
    crearSolicitud(
      solicitud({ tipo: 'cambio_equipo', employeeId: 'e1', cambios: [] }),
      's1',
      USUARIO
    )
  ).rejects.toMatchObject({
    status: 409,
    message: expect.stringMatching(/Ana Rojas ya está desvinculado\./),
  });
});

test('desvincular otra vez a alguien sin equipos "No devuelto": 409', async () => {
  mockDb.employee.findUnique.mockResolvedValue(desvinculado);
  mockDb.assignment.count.mockResolvedValue(0);
  await expect(
    crearSolicitud(solicitud({ tipo: 'offboarding', employeeId: 'e1' }), 's1', USUARIO)
  ).rejects.toMatchObject({
    status: 409,
    message: expect.stringMatching(/no tiene equipos pendientes de devolución/),
  });
});

test('onboarding con equipos pero sin datos de entrega: 400', async () => {
  await expect(
    crearSolicitud(
      solicitud({
        tipo: 'onboarding',
        assetIdsSeleccionados: ['a1'],
        kitItemsSeleccionados: [],
        kitItemsRequeridos: [],
        medioEntrega: 'presencial',
      }),
      's1',
      USUARIO
    )
  ).rejects.toMatchObject({
    status: 400,
    message: expect.stringMatching(/Faltan los datos de entrega/),
  });
  expect(mockDb.$transaction).not.toHaveBeenCalled();
});

test('onboarding con Kit requerido que no se entrega: 400', async () => {
  await expect(
    crearSolicitud(
      solicitud({
        tipo: 'onboarding',
        assetIdsSeleccionados: [],
        kitItemsSeleccionados: [],
        kitItemsRequeridos: [{ itemId: 'k1', cantidad: 1 }],
      }),
      's1',
      USUARIO
    )
  ).rejects.toMatchObject({
    status: 400,
    message: expect.stringMatching(/debe entregarse al crear/),
  });
});
