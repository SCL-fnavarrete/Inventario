import { PrismaClient, SystemRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Seed minimo, pensado para producción (11-sep-2026, redefinido a pedido
 * explícito de Javier: "vamos a definir el seed nuevamente, como ha
 * cambiado tanto la app").
 *
 * Antes este archivo también creaba: una sede de ejemplo por bodega, un
 * usuario técnico de prueba, un catálogo de Kit de Bienvenida/EPP, 4
 * empleados ficticios y 8 activos ficticios (notebooks, celulares,
 * monitores). Javier los sacó a todos explícitamente porque ya existe
 * pantalla en Configuración para crear cada uno de esos catálogos a mano
 * (Sedes, Kit/EPP), y porque los empleados y activos reales los va a crear
 * él mismo -- no tiene sentido que el sistema arranque con datos de
 * mentira que hay que borrar antes de usarlo en serio.
 *
 * Lo que queda es lo mínimo sin lo cual el sistema no se puede operar
 * desde la UI:
 *   1. El catálogo de categorías de activos (Notebook, Celular, etc.) --
 *      es la única pieza de este archivo que NO tiene una pantalla propia
 *      para crearla en Configuración (se buscó explícitamente: no existe
 *      POST alguno para AssetCategory fuera de este seed).
 *   2. Un usuario administrador -- sin esto no hay con qué iniciar sesión
 *      la primera vez, y todo lo demás (sedes, empleados, activos, kit)
 *      se crea desde la UI una vez adentro.
 *
 * Sedes, Kit/EPP, empleados y activos ya NO se crean aquí -- se crean
 * desde Configuración (Sedes, Kit/EPP) o desde sus propios formularios
 * (Empleados, Activos) con los datos reales de la empresa.
 *
 * Actualización 11-sep-2026 (a pedido explícito de Javier): se sacaron del
 * catálogo por defecto las categorías "Impresora" y "Docking Station". El
 * catálogo de categorías no tiene pantalla propia en Configuración (ver
 * nota más arriba), así que si se necesitan más adelante hay que agregarlas
 * a mano en la base de datos o volver a incluirlas aquí y correr el seed.
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
  const categorias = [
    { nombre: "Notebook", descripcion: "Computadores portátiles", requiereSerie: true, requiereImei: false },
    { nombre: "Celular", descripcion: "Teléfonos móviles corporativos", requiereSerie: true, requiereImei: true },
    { nombre: "Monitor", descripcion: "Pantallas y monitores", requiereSerie: true, requiereImei: false },
    { nombre: "Mouse", descripcion: "Mouse y dispositivos de entrada", requiereSerie: false, requiereImei: false },
    { nombre: "Teclado", descripcion: "Teclados", requiereSerie: false, requiereImei: false },
    { nombre: "Webcam", descripcion: "Cámaras web", requiereSerie: true, requiereImei: false },
    { nombre: "Audífonos", descripcion: "Audífonos y headsets", requiereSerie: false, requiereImei: false },
  ];

  for (const cat of categorias) {
    await prisma.assetCategory.upsert({
      where: { nombre: cat.nombre },
      update: {},
      create: cat,
    });
  }
  console.log("Categorías de activos creadas:", categorias.length);

  console.log("Seed completado exitosamente!");
  console.log(
    "Próximo paso: inicia sesión como admin y crea desde Configuración las sedes, " +
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
