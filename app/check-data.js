const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.asset.count();
  const disponibles = await prisma.asset.count({ where: { estado: 'disponible' } });
  const asignados = await prisma.asset.count({ where: { estado: 'asignado' } });
  const empleados = await prisma.employee.count();
  const empActivos = await prisma.employee.count({ where: { estado: 'activo' } });

  console.log('=== RESUMEN DE LA BASE DE DATOS ===');
  console.log('Total Activos:', total);
  console.log('Disponibles:', disponibles);
  console.log('Asignados:', asignados);
  console.log('Total Empleados:', empleados);
  console.log('Empleados Activos:', empActivos);

  // Por categoria
  const categorias = await prisma.assetCategory.findMany({
    include: {
      _count: {
        select: { assets: true }
      }
    }
  });

  console.log('\n=== ACTIVOS POR CATEGORIA ===');
  for (const cat of categorias) {
    console.log(`${cat.nombre}: ${cat._count.assets}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
