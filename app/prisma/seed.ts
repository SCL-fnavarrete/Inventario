import { PrismaClient, SystemRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

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

  // 1. Crear usuario administrador
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const adminUser = await prisma.systemUser.upsert({
    where: { email: "admin@sclconsultores.com" },
    update: {},
    create: {
      email: "admin@sclconsultores.com",
      passwordHash: hashedPassword,
      nombre: "Administrador Sistema",
      rol: SystemRole.admin,
      activo: true,
    },
  });
  console.log("Usuario admin creado:", adminUser.email);
  console.log(
    "  -> Cambia la contraseña por defecto ('admin123') apenas inicies sesión."
  );

  // 2. Crear categorías de activos
  // tipoFicha decide los campos especiales del formulario (SPEC 2.112.7).
  const categorias = [
    { nombre: "Notebook", descripcion: "Computadores portátiles", requiereSerie: true, requiereImei: false, tipoFicha: "computador" as const },
    { nombre: "Celular", descripcion: "Teléfonos móviles corporativos", requiereSerie: true, requiereImei: true, tipoFicha: "celular" as const },
    { nombre: "Monitor", descripcion: "Pantallas y monitores", requiereSerie: true, requiereImei: false, tipoFicha: "monitor" as const },
    { nombre: "Mouse", descripcion: "Mouse y dispositivos de entrada", requiereSerie: false, requiereImei: false, tipoFicha: "periferico" as const },
    { nombre: "Teclado", descripcion: "Teclados", requiereSerie: false, requiereImei: false, tipoFicha: "periferico" as const },
    { nombre: "Webcam", descripcion: "Cámaras web", requiereSerie: true, requiereImei: false, tipoFicha: "periferico" as const },
    { nombre: "Audífonos", descripcion: "Audífonos y headsets", requiereSerie: false, requiereImei: false, tipoFicha: "periferico" as const },
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
