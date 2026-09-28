/** @jest-environment node */
jest.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: jest.fn(), asset: { findMany: jest.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { seriesEImeiExistentes } from "@/lib/importacion/contexto";

// Auditoria 28-sep-2026 (3.2): la importacion busca solo las series e IMEI
// de las filas que llegan, no toda la tabla.
const db = prisma as unknown as { $queryRaw: jest.Mock; asset: { findMany: jest.Mock } };

beforeEach(() => jest.clearAllMocks());

test("busca solo las series (en mayúsculas, sin repetir) y los IMEI de las filas", async () => {
  db.$queryRaw.mockResolvedValue([{ serie: "ABC1" }]);
  db.asset.findMany.mockResolvedValue([{ imei: "356938035643809" }]);

  const r = await seriesEImeiExistentes([
    { numeroSerie: "abc1", imei: "35-693803-564380-9" },
    { numeroSerie: "ABC1" },
    { numeroSerie: "zz9" },
  ]);

  // Primer argumento: los textos del SQL; segundo: la lista de series.
  const seriesBuscadas = db.$queryRaw.mock.calls[0][1];
  expect(seriesBuscadas).toEqual(["ABC1", "ZZ9"]);
  expect(db.asset.findMany.mock.calls[0][0].where.imei.in).toEqual(["356938035643809"]);
  expect([...r.existingSeriesSet]).toEqual(["ABC1"]);
  expect([...r.existingImeiSet]).toEqual(["356938035643809"]);
});

test("sin series ni IMEI no consulta la base", async () => {
  const r = await seriesEImeiExistentes([{ marca: "Dell" }]);
  expect(db.$queryRaw).not.toHaveBeenCalled();
  expect(db.asset.findMany).not.toHaveBeenCalled();
  expect(r.existingSeriesSet.size + r.existingImeiSet.size).toBe(0);
});
