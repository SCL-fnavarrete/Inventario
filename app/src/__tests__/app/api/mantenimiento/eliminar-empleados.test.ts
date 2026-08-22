/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({ user: { email: 'admin@example.com' } }),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/mantenimiento/eliminar/route';

describe('POST /api/mantenimiento/eliminar', () => {
  test('rechaza la purga masiva de empleados para no destruir evidencia ISO', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/mantenimiento/eliminar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipo: 'empleados' }),
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/baja lógica/i),
    });
  });
});
