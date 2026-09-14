import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type PrismaOCliente = typeof prisma | Prisma.TransactionClient;

/**
 * Calcula el próximo número de guía de despacho (formato GD-<año>-NNNNN).
 *
 * Antes esta lógica estaba duplicada: una copia en línea dentro de
 * `POST /api/guias-despacho` (la que de verdad se usaba) y otra idéntica en
 * `GET /api/guias-despacho/numero`, que nadie llamaba -- código muerto que
 * además podía desincronizarse de la copia real si alguna de las dos se
 * modificaba sin tocar la otra. Se unifica acá (14-sep-2026, SPEC 2.26) y
 * ambas rutas la reutilizan.
 */
export async function generarNumeroGuia(cliente: PrismaOCliente = prisma): Promise<string> {
  const year = new Date().getFullYear();

  const lastGuide = await cliente.dispatchGuide.findFirst({
    where: {
      numero: {
        startsWith: `GD-${year}-`,
      },
    },
    orderBy: { numero: 'desc' },
  });

  let nextNumber = 1;
  if (lastGuide) {
    const lastNumber = parseInt(lastGuide.numero.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `GD-${year}-${nextNumber.toString().padStart(5, '0')}`;
}
