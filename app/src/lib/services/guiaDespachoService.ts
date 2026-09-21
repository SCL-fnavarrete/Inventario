import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type PrismaOCliente = typeof prisma | Prisma.TransactionClient;

/**
 * Calcula el próximo número de guía de despacho (formato GD-<año>-NNNNN).
 * Punto único de esta lógica, reutilizado por las rutas que lo necesitan.
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
