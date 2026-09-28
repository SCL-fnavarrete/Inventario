/**
 * @jest-environment node
 */
/**
 * Transicion de solicitudes (auditoria 27-sep-2026, 5.2-C). A diferencia de
 * otros tests de API, aqui NO se simula sedeScope: se usa el aislamiento por
 * sede real, para que el test pueda detectar si se rompe.
 */
jest.mock('@/lib/auth/guard', () => {
  const real = jest.requireActual('@/lib/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});
jest.mock('@/lib/prisma', () => ({
  prisma: {
    systemUser: { findUnique: jest.fn() },
    workflowRequest: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/solicitudes/[id]/transicion/route';

const tecnico = (sedeId: string) => ({ user: { id: 't1', email: 't@scl.cl', name: 'Téc', role: 'tecnico', sedeId } });
const pedir = (body: unknown) =>
  new NextRequest('http://x/api/solicitudes/s1/transicion', { method: 'POST', body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: 's1' }) };
const solicitud = {
  id: 's1', numero: 'WF-2026-0001', sedeId: 'stgo', tipo: 'onboarding', estado: 'equipos_entregados',
  employeeId: 'e1', assignmentIds: [], kitReturnIds: [], updatedAt: new Date('2026-09-27T10:00:00Z'),
  kitBienvenidaSolicitado: false, eppSolicitado: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.systemUser.findUnique as jest.Mock).mockResolvedValue({ id: 't1', nombre: 'Téc', rol: 'tecnico' });
});

it('un técnico no puede mover una solicitud de otra sede: 404 y sin transacción', async () => {
  (requirePermission as jest.Mock).mockResolvedValue(tecnico('conce'));
  (prisma.workflowRequest.findUnique as jest.Mock).mockResolvedValue(solicitud);
  const res = await POST(pedir({ nuevoEstado: 'registro_rrhh' }), ctx);
  expect(res.status).toBe(404);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it('rechaza datosAccion mal formados con 400 antes de tocar la base', async () => {
  (requirePermission as jest.Mock).mockResolvedValue(tecnico('stgo'));
  const res = await POST(pedir({ nuevoEstado: 'equipos_entregados', datosAccion: { assetIds: 'abc' } }), ctx);
  expect(res.status).toBe(400);
  expect(prisma.workflowRequest.findUnique).not.toHaveBeenCalled();
});

it('un doble envío: si la solicitud ya cambió, responde 409 (R1)', async () => {
  (requirePermission as jest.Mock).mockResolvedValue(tecnico('stgo'));
  (prisma.workflowRequest.findUnique as jest.Mock).mockResolvedValue({ ...solicitud, estado: 'solicitud_recibida' });
  // La transacción ejecuta el callback con un tx cuyo reclamo no encuentra la fila.
  (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({ workflowRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } })
  );
  const res = await POST(pedir({ nuevoEstado: 'gestion_ti' }), ctx);
  expect(res.status).toBe(409);
});
