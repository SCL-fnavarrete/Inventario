import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const sedes = await prisma.sede.findMany({ select: { id: true, nombre: true, codigo: true } });
console.log(JSON.stringify(sedes, null, 2));
await prisma.$disconnect();
