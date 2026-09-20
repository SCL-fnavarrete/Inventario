/**
 * @jest-environment node
 */

jest.mock('next-auth', () => ({
  getServerSession: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/prisma', () => {
  const { Prisma } = jest.requireActual('@prisma/client') as typeof import('@prisma/client');

  // El resumen de /reportes filtra por modelo. Un filtro con un campo que el
  // modelo no tiene revienta recien en runtime contra la base, asi que aqui
  // se valida contra el DMMF: si alguien filtra Asset o Employee por un campo
  // inexistente (el caso clasico: `sedeId` en un modelo que no lo tiene
  // propio y se filtra via relacion), el test falla antes de llegar a prod.
  const clavesValidas = (modelo: string) => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === modelo);
    return new Set([
      ...(model?.fields.map((field) => field.name) ?? []),
      'AND',
      'OR',
      'NOT',
    ]);
  };

  const contadorValidado = (modelo: string) => {
    const validWhereKeys = clavesValidas(modelo);
    return jest.fn(async (args?: { where?: Record<string, unknown> }) => {
      const invalidKeys = Object.keys(args?.where ?? {}).filter(
        (key) => !validWhereKeys.has(key)
      );

      if (invalidKeys.length > 0) {
        throw new Error(`Invalid ${modelo} filter: ${invalidKeys.join(', ')}`);
      }

      return 0;
    });
  };

  return {
    prisma: {
      asset: {
        count: contadorValidado('Asset'),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      employee: {
        count: contadorValidado('Employee'),
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
