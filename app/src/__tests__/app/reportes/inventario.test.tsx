/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({}),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => {
  const { Prisma } = jest.requireActual('@prisma/client') as typeof import('@prisma/client');
  const whereKeys = (model: string) =>
    new Set([
      ...(Prisma.dmmf.datamodel.models
        .find((candidate) => candidate.name === model)
        ?.fields.map((field) => field.name) ?? []),
      'AND',
      'OR',
      'NOT',
    ]);
  const assetWhereKeys = whereKeys('Asset');
  const assignmentWhereKeys = whereKeys('Assignment');
  const assertDmmfWhere = (model: string, keys: Set<string>, where: Record<string, unknown>) => {
    const invalidKeys = Object.keys(where).filter((key) => !keys.has(key));
    if (invalidKeys.length > 0) {
      throw new Error(`Invalid ${model} filter: ${invalidKeys.join(', ')}`);
    }
  };

  return {
    prisma: {
      asset: {
        findMany: jest.fn(
          async (args: {
            where?: Record<string, unknown>;
            include?: { assignments?: { where?: Record<string, unknown> } };
          }) => {
            assertDmmfWhere('Asset', assetWhereKeys, args.where ?? {});
            if (args.where?.deletedAt !== null) {
              throw new Error('Asset query must exclude discarded records');
            }
            assertDmmfWhere(
              'Assignment',
              assignmentWhereKeys,
              args.include?.assignments?.where ?? {}
            );
            return [];
          }
        ),
      },
    },
  };
});

import ReporteInventarioPage from '@/app/(dashboard)/reportes/inventario/page';
import { GET } from '@/app/api/reportes/inventario/excel/route';

describe('consumidores del reporte de inventario', () => {
  test('la página consulta activos vigentes con filtros válidos para Asset y Assignment', async () => {
    await expect(ReporteInventarioPage()).resolves.toBeTruthy();
  });

  test('la exportación Excel consulta activos vigentes con filtros válidos para Asset y Assignment', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('spreadsheetml.sheet');
  });
});
