const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function testAuth() {
  try {
    console.log('=== TEST DE AUTENTICACIÓN ===\n');

    // 1. Buscar usuario
    const email = 'admin@sclconsultores.com';
    const password = 'admin123';

    console.log(`1. Buscando usuario: ${email}`);
    const user = await prisma.systemUser.findUnique({
      where: { email }
    });

    if (!user) {
      console.log('ERROR: Usuario no encontrado');
      return;
    }

    console.log('Usuario encontrado:');
    console.log(`   - ID: ${user.id}`);
    console.log(`   - Nombre: ${user.nombre}`);
    console.log(`   - Rol: ${user.rol}`);
    console.log(`   - Activo: ${user.activo}`);
    console.log(`   - Password Hash: ${user.passwordHash}\n`);

    // 2. Verificar contraseña
    console.log(`2. Verificando contraseña: "${password}"`);
    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log(`   - Resultado: ${isValid ? 'VÁLIDA ✓' : 'INVÁLIDA ✗'}\n`);

    // 3. Probar hash nuevo
    console.log('3. Generando nuevo hash para verificación:');
    const newHash = await bcrypt.hash(password, 10);
    console.log(`   - Nuevo hash: ${newHash}`);
    const testNew = await bcrypt.compare(password, newHash);
    console.log(`   - Test nuevo hash: ${testNew ? 'VÁLIDO ✓' : 'INVÁLIDO ✗'}\n`);

    // 4. Verificar variables de entorno
    console.log('4. Variables de entorno:');
    console.log(`   - DATABASE_URL: ${process.env.DATABASE_URL ? 'Configurada ✓' : 'NO CONFIGURADA ✗'}`);
    console.log(`   - NEXTAUTH_SECRET: ${process.env.NEXTAUTH_SECRET ? 'Configurada ✓' : 'NO CONFIGURADA ✗'}`);
    console.log(`   - NEXTAUTH_URL: ${process.env.NEXTAUTH_URL || 'NO CONFIGURADA ✗'}\n`);

  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testAuth();
