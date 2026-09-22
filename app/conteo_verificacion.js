const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sedes = await prisma.sede.findMany({ select: { id: true, nombre: true, codigo: true } });
  const sinSede = { id: null, nombre: '(sin sede)' };
  const grupos = [...sedes, sinSede];

  console.log('SEDE'.padEnd(15), 'ACTIVOS'.padStart(8), 'DISP'.padStart(6), 'ASIG'.padStart(6), 'MANT'.padStart(6), 'NODEV'.padStart(6), 'BAJA'.padStart(6), 'VEND'.padStart(6), 'EMPL'.padStart(6), 'ASIGNAC'.padStart(8), 'MANTREG'.padStart(8));

  let totActivos=0, totDisp=0, totAsig=0, totMant=0, totNodev=0, totBaja=0, totVend=0, totEmpl=0, totAsignac=0, totMantReg=0;

  for (const s of grupos) {
    const where = s.id ? { sedeId: s.id } : { sedeId: null };
    const [total, disp, asig, mant, nodev, baja, vend, empl, asignac, mantReg] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.count({ where: { ...where, estado: 'disponible' } }),
      prisma.asset.count({ where: { ...where, estado: 'asignado' } }),
      prisma.asset.count({ where: { ...where, estado: 'en_mantencion' } }),
      prisma.asset.count({ where: { ...where, estado: 'no_devuelto' } }),
      prisma.asset.count({ where: { ...where, estado: 'baja' } }),
      prisma.asset.count({ where: { ...where, estado: 'vendido' } }),
      prisma.employee.count({ where }),
      prisma.assignment.count({ where: { asset: where } }),
      prisma.maintenance.count({ where: { asset: where } }),
    ]);
    console.log(
      s.nombre.padEnd(15), String(total).padStart(8), String(disp).padStart(6), String(asig).padStart(6),
      String(mant).padStart(6), String(nodev).padStart(6), String(baja).padStart(6), String(vend).padStart(6),
      String(empl).padStart(6), String(asignac).padStart(8), String(mantReg).padStart(8)
    );
    totActivos+=total; totDisp+=disp; totAsig+=asig; totMant+=mant; totNodev+=nodev; totBaja+=baja; totVend+=vend; totEmpl+=empl; totAsignac+=asignac; totMantReg+=mantReg;
  }
  console.log(
    'TOTAL'.padEnd(15), String(totActivos).padStart(8), String(totDisp).padStart(6), String(totAsig).padStart(6),
    String(totMant).padStart(6), String(totNodev).padStart(6), String(totBaja).padStart(6), String(totVend).padStart(6),
    String(totEmpl).padStart(6), String(totAsignac).padStart(8), String(totMantReg).padStart(8)
  );

  // total real de empleados y activos (sin depender de sede) por si hay huerfanos
  const totalActivosReal = await prisma.asset.count();
  const totalEmpleadosReal = await prisma.employee.count();
  const totalAsignacReal = await prisma.assignment.count();
  const totalMantReal = await prisma.maintenance.count();
  console.log('\nTotales reales en BD (sin agrupar):', { totalActivosReal, totalEmpleadosReal, totalAsignacReal, totalMantReal });
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
