const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  try {
    const users = await prisma.systemUser.findMany();
    console.log('=== USUARIOS EN LA BASE DE DATOS ===');
    console.log(`Total de usuarios: ${users.length}`);
    console.log('');

    if (users.length === 0) {
      console.log('NO HAY USUARIOS EN LA BASE DE DATOS');
      console.log('Ejecuta: npm run db:seed');
    } else {
      users.forEach(user => {
        console.log(`Email: ${user.email}`);
        console.log(`Nombre: ${user.nombre}`);
        console.log(`Rol: ${user.rol}`);
        console.log(`Activo: ${user.activo}`);
        console.log(`Password Hash: ${user.passwordHash.substring(0, 20)}...`);
        console.log('---');
      });
    }
  } catch (error) {
    console.error('Error al consultar usuarios:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
