/**
 * @jest-environment node
 *
 * Cuando Entra ID deshabilita una cuenta y la persona todavía tiene equipos,
 * el sistema la marca como desvinculada y el activo se queda afuera sin que
 * nadie se entere. La alerta existía como una entrada en el JSON de respuesta
 * de la sincronización: la veía quien apretaba el botón, y nadie más.
 *
 * Ahora deja evidencia y sale por correo, con la misma semántica staged que
 * el resto de la Ola 2: fila `pendiente` dentro de la transacción del
 * empleado, envío después del commit.
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
    employee: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('@/lib/services/notificationService', () => ({
  prepararNotificacion: jest.fn(),
  enviarNotificacion: jest.fn(),
}));

import { POST } from '@/app/api/microsoft-sync/route';
import { prisma } from '@/lib/prisma';
import { fetchMicrosoftUsers } from '@/lib/services/microsoftGraphService';
import { enviarNotificacion, prepararNotificacion } from '@/lib/services/notificationService';

const usuarioGraph = {
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

function empleado(overrides: Record<string, unknown> = {}) {
  return {
    id: 'employee-1',
    ...usuarioGraph,
    rut: '11.111.111-1',
    tipoContrato: 'externo',
    fechaIngreso: null,
    fechaTermino: null,
    estado: 'activo',
    origenMicrosoft: true,
    fechaEntregaEpp: null,
    fechaEntregaKit: null,
    proximaMantencionEpp: null,
    activosActuales: [],
    ...overrides,
  };
}

let orden: string[];

function configurarTransaccion() {
  const tx = {
    employee: { create: jest.fn().mockResolvedValue(empleado()), update: jest.fn().mockResolvedValue(empleado({ estado: 'desvinculado' })) },
    employeeHistory: { create: jest.fn().mockResolvedValue({ id: 'history-1' }) },
    notificacionEnviada: { create: jest.fn() },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
    const resultado = await callback(tx);
    orden.push('commit');
    return resultado;
  });
  return tx;
}

beforeEach(() => {
  jest.clearAllMocks();
  orden = [];
  (prisma.employee.findUnique as jest.Mock).mockReset();
  (prepararNotificacion as jest.Mock).mockImplementation(async (_tx, params) => {
    orden.push(`preparar:${params.tipo}`);
    return { notificacionId: 'notificacion-1', destinatarios: ['ti@sclconsultores.com'] };
  });
  (enviarNotificacion as jest.Mock).mockImplementation(async (notificacionId: string) => {
    orden.push(`enviar:${notificacionId}`);
    return { notificacionId, estado: 'enviada', error: null };
  });
});

describe('POST /api/microsoft-sync — alerta de equipos pendientes', () => {
  test('prepara la alerta en la transacción del empleado y la envía tras el commit', async () => {
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...usuarioGraph, accountEnabled: false },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValueOnce(
      empleado({ activosActuales: [{ id: 'asset-1' }, { id: 'asset-2' }] })
    );
    configurarTransaccion();

    const response = await POST();

    expect(response.status).toBe(200);
    expect(orden).toEqual(['preparar:alerta_equipos_pendientes', 'commit', 'enviar:notificacion-1']);
    const [, params] = (prepararNotificacion as jest.Mock).mock.calls[0];
    expect(params.documentoIds).toEqual([]);
    expect(params.asunto).toContain('Ada Lovelace');
    expect(params.cuerpo).toContain('2 equipo');
    expect(params.enviadaPor).toBe('sync-admin@example.com');
  });

  test('una cuenta deshabilitada sin equipos no genera alerta', async () => {
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...usuarioGraph, accountEnabled: false },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValueOnce(empleado());
    configurarTransaccion();

    await POST();

    expect(prepararNotificacion).not.toHaveBeenCalled();
    expect(enviarNotificacion).not.toHaveBeenCalled();
  });

  test('un empleado que ya estaba desvinculado no vuelve a alertar', async () => {
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...usuarioGraph, accountEnabled: false },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValueOnce(
      empleado({ estado: 'desvinculado', activosActuales: [{ id: 'asset-1' }] })
    );
    configurarTransaccion();

    await POST();

    expect(prepararNotificacion).not.toHaveBeenCalled();
  });

  test('el resultado declara el estado del aviso, no solo que hubo alerta', async () => {
    (enviarNotificacion as jest.Mock).mockResolvedValue({
      notificacionId: 'notificacion-1',
      estado: 'fallida',
      error: 'sendMail: Microsoft Graph respondio 403',
    });
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...usuarioGraph, accountEnabled: false },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValueOnce(
      empleado({ activosActuales: [{ id: 'asset-1' }] })
    );
    configurarTransaccion();

    const cuerpo = await (await POST()).json();

    expect(cuerpo.alertas[0]).toMatchObject({
      tipo: 'equipos_pendientes',
      empleado: 'Ada Lovelace',
      equipos: 1,
      notificacion: expect.objectContaining({ estado: 'fallida' }),
    });
  });

  test('un fallo del correo no rompe la sincronización', async () => {
    (enviarNotificacion as jest.Mock).mockRejectedValue(new Error('Graph caido'));
    (fetchMicrosoftUsers as jest.Mock).mockResolvedValue([
      { ...usuarioGraph, accountEnabled: false },
    ]);
    (prisma.employee.findUnique as jest.Mock).mockResolvedValueOnce(
      empleado({ activosActuales: [{ id: 'asset-1' }] })
    );
    configurarTransaccion();

    const response = await POST();

    expect(response.status).toBe(200);
    expect((await response.json()).desactivados).toBe(1);
  });
});
