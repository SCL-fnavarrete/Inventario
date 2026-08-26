/**
 * @jest-environment node
 */

jest.mock('next-auth', () => ({
  getServerSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/prisma', () => {
  const { Prisma } = jest.requireActual('@prisma/client') as typeof import('@prisma/client');
  const terminationModel = Prisma.dmmf.datamodel.models.find(
    (model) => model.name === 'Termination'
  );
  const validWhereKeys = new Set([
    ...(terminationModel?.fields.map((field) => field.name) ?? []),
    'AND',
    'OR',
    'NOT',
  ]);

  return {
    prisma: {
      asset: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      employee: {
        count: jest.fn().mockResolvedValue(0),
      },
      termination: {
        count: jest.fn(async (args?: { where?: Record<string, unknown> }) => {
          const invalidKeys = Object.keys(args?.where ?? {}).filter(
            (key) => !validWhereKeys.has(key)
          );

          if (invalidKeys.length > 0) {
            throw new Error(`Invalid Termination filter: ${invalidKeys.join(', ')}`);
          }

          return 0;
        }),
      },
    },
  };
});

import ReportesPage from '@/app/(dashboard)/reportes/page';

describe('ReportesPage', () => {
  test('renderiza el resumen usando filtros válidos para cada modelo Prisma', async () => {
    await expect(ReportesPage()).resolves.toBeTruthy();
  });
});
