import { PrismaClient, SystemRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { validarPasswordFuerte } from "../src/modules/configuracion/clave";

const prisma = new PrismaClient();

/**
 * Seed minimo, pensado para producción: no crea datos de ejemplo (sedes,
 * empleados, activos ficticios) ya que esos se crean desde la UI con los
 * datos reales de la empresa.
 *
 * Lo que queda es lo mínimo sin lo cual el sistema no se puede operar
 * desde la UI:
 *   1. El catálogo de categorías de activos (Notebook, Celular, etc.) --
 *      no tiene una pantalla propia para crearla en Configuración.
 *   2. Un usuario administrador -- sin esto no hay con qué iniciar sesión
 *      la primera vez.
 *   3. La sede Perú, como excepción puntual: Santiago y Concepción ya
 *      existen en la base real y no se recrean acá para no arriesgar un
 *      código duplicado.
 *
 * Sedes adicionales, Kit/EPP, empleados y activos se crean desde
 * Configuración o desde sus propios formularios.
 */
async function main() {
  console.log("Iniciando seed de datos...");

  // 1. Crear usuario administrador. Correo y clave salen de variables de
  // entorno: antes la clave era "admin123" fija y publicada en el README
  // (auditoria 27-sep-2026, F1-02). La clave debe cumplir la misma politica
  // que Configuracion > Usuarios.
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@sclconsultores.com").toLowerCase().trim();
  const clave = process.env.SEED_ADMIN_PASSWORD;
  const errorClave = clave ? validarPasswordFuerte(clave) : "Falta la variable SEED_ADMIN_PASSWORD";
  if (errorClave) {
    throw new Error(`Seed: ${errorClave}. Defínela en .env antes de correr el seed.`);
  }
  const hashedPassword = await bcrypt.hash(clave!, 12);

  // update: {} -- si el admin ya existe no se le cambia la clave.
  const adminUser = await prisma.systemUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: hashedPassword,
      nombre: "Administrador Sistema",
      rol: SystemRole.admin,
      activo: true,
    },
  });
  console.log("Usuario admin listo:", adminUser.email);

  // 2. Crear categorías de activos
  // tipoFicha decide los campos especiales del formulario (SPEC 2.112.7).
  const categorias = [
    { nombre: "Notebook", descripcion: "Computadores portátiles", tipoFicha: "computador" as const },
    { nombre: "Celular", descripcion: "Teléfonos móviles corporativos", tipoFicha: "celular" as const },
    { nombre: "Monitor", descripcion: "Pantallas y monitores", tipoFicha: "monitor" as const },
    { nombre: "Mouse", descripcion: "Mouse y dispositivos de entrada", tipoFicha: "periferico" as const },
    { nombre: "Teclado", descripcion: "Teclados", tipoFicha: "periferico" as const },
    { nombre: "Webcam", descripcion: "Cámaras web", tipoFicha: "periferico" as const },
    { nombre: "Audífonos", descripcion: "Audífonos y headsets", tipoFicha: "periferico" as const },
  ];

  for (const cat of categorias) {
    await prisma.assetCategory.upsert({
      where: { nombre: cat.nombre },
      update: {},
      create: cat,
    });
  }
  console.log("Categorías de activos creadas:", categorias.length);

  // 3. Sede Perú (ver nota arriba sobre por qué Santiago/Concepción no
  // están acá).
  const sedePeru = await prisma.sede.upsert({
    where: { codigo: "PERU" },
    update: {},
    create: {
      codigo: "PERU",
      nombre: "Perú",
      activa: true,
    },
  });
  console.log("Sede creada:", sedePeru.nombre, `(${sedePeru.codigo})`);

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
