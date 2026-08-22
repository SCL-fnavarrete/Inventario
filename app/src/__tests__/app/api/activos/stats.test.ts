/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({}),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      count: jest.fn().mockResolvedValue(1),
      groupBy: jest.fn(async (args: { by: string[]; where?: { deletedAt?: null } }) => {
        if (args.by[0] === 'estado') {
          return [{ estado: 'disponible', _count: { estado: 1 } }];
        }

        return args.where?.deletedAt === null
          ? [{ condicion: 'nuevo', _count: { condicion: 1 } }]
          : [{ condicion: 'nuevo', _count: { condicion: 2 } }];
      }),
    },
    assetCategory: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { GET } from '@/app/api/activos/stats/route';

describe('GET /api/activos/stats', () => {
  test('excluye activos descartados del agrupamiento por condición', async () => {
    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      byCondition: { nuevo: 1 },
    });
  });
});
