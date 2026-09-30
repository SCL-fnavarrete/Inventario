import { PrismaClient, SystemRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { validarPasswordFuerte } from "../src/modules/configuracion/clave";
import { FORMATO_USUARIO, normalizarUsuario, USUARIO_MAX, USUARIO_MIN } from "../src/shared/auth/usuario";

const prisma = new PrismaClient();

/**
 * Seed minimo, pensado para producción: no crea datos de ejemplo (sedes,
 * empleados, activos ficticios) ya que esos se crean desde la UI con los
 * datos reales de la empresa.
 *
 * Solo crea el primer usuario administrador: sin él no hay con qué iniciar
 * sesión la primera vez.
 *
 * Los catálogos base los crean las migraciones: sedes (Santiago, Concepción,
 * Perú), categorías de activos, tipos de mantención, marcas y motivos de
 * baja. Sedes adicionales, Kit/EPP, empleados y activos se crean desde
 * Configuración o desde sus propios formularios.
 */
async function main() {
  console.log("Iniciando seed de datos...");

  // 1. Crear usuario administrador. Usuario, correo (opcional) y clave salen
  // de variables de entorno: antes la clave era "admin123" fija y publicada
  // en el README (auditoria 27-sep-2026, F1-02). Usuario y clave siguen las
  // mismas reglas que Configuracion > Usuarios (SPEC 2.122).
  const usuario = normalizarUsuario(process.env.SEED_ADMIN_USUARIO || "admin");
  if (usuario.length < USUARIO_MIN || usuario.length > USUARIO_MAX || !FORMATO_USUARIO.test(usuario)) {
    throw new Error("Seed: SEED_ADMIN_USUARIO debe tener de 3 a 30 minúsculas, números, punto, guion o guion bajo.");
  }
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim() || null;
  const clave = process.env.SEED_ADMIN_PASSWORD;
  const errorClave = clave ? validarPasswordFuerte(clave) : "Falta la variable SEED_ADMIN_PASSWORD";
  if (errorClave) {
    throw new Error(`Seed: ${errorClave}. Defínela en .env antes de correr el seed.`);
  }
  const hashedPassword = await bcrypt.hash(clave!, 12);

  // update: {} -- si el admin ya existe no se le cambia la clave.
  const adminUser = await prisma.systemUser.upsert({
    where: { usuario },
    update: {},
    create: {
      usuario,
      email,
      passwordHash: hashedPassword,
      nombre: "Administrador Sistema",
      rol: SystemRole.admin,
      activo: true,
    },
  });
  console.log("Usuario admin listo:", adminUser.usuario);

  console.log("Seed completado exitosamente!");
  console.log(
    "Próximo paso: inicia sesión como admin y crea desde Configuración las sedes que falten, " +
      "el catálogo de Kit/EPP, y luego los empleados y activos reales de la empresa."
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
