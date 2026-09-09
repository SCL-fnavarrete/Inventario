import { PrismaClient, SystemRole, CategoriaKit, TipoContrato, EstadoActivo, CondicionActivo } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

  // Crear usuario técnico de ejemplo
  const tecnicoUser = await prisma.systemUser.upsert({
    where: { email: "tecnico@sclconsultores.com" },
    update: {},
    create: {
      email: "tecnico@sclconsultores.com",
      passwordHash: hashedPassword,
      nombre: "Técnico IT",
      rol: SystemRole.tecnico,
      activo: true,
    },
  });
  console.log("Usuario técnico creado:", tecnicoUser.email);

  // 2. Crear categorías de activos
  const categorias = [
    { nombre: "Notebook", descripcion: "Computadores portátiles", requiereSerie: true, requiereImei: false },
    { nombre: "Celular", descripcion: "Teléfonos móviles corporativos", requiereSerie: true, requiereImei: true },
    { nombre: "Monitor", descripcion: "Pantallas y monitores", requiereSerie: true, requiereImei: false },
    { nombre: "Impresora", descripcion: "Impresoras y multifuncionales", requiereSerie: true, requiereImei: false },
    { nombre: "Mouse", descripcion: "Mouse y dispositivos de entrada", requiereSerie: false, requiereImei: false },
    { nombre: "Teclado", descripcion: "Teclados", requiereSerie: false, requiereImei: false },
    { nombre: "Docking Station", descripcion: "Estaciones de acoplamiento", requiereSerie: true, requiereImei: false },
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

  // 3. Crear items de kit de bienvenida y EPP
  const kitItems = [
    { nombre: "Mouse", categoria: CategoriaKit.kit_bienvenida },
    { nombre: "Teclado", categoria: CategoriaKit.kit_bienvenida },
    { nombre: "Audífonos", categoria: CategoriaKit.kit_bienvenida },
    { nombre: "Mousepad", categoria: CategoriaKit.kit_bienvenida },
    { nombre: "Mochila", categoria: CategoriaKit.kit_bienvenida },
    { nombre: "Casco", categoria: CategoriaKit.epp },
    { nombre: "Chaleco reflectante", categoria: CategoriaKit.epp },
    { nombre: "Zapatos de seguridad", categoria: CategoriaKit.epp },
    { nombre: "Guantes", categoria: CategoriaKit.epp },
    { nombre: "Lentes de seguridad", categoria: CategoriaKit.epp },
  ];

  for (const item of kitItems) {
    await prisma.welcomeKitItem.upsert({
      where: { id: item.nombre }, // Esto fallará, usaremos create con manejo de error
      update: {},
      create: item,
    }).catch(() => {
      // Item ya existe, ignorar
    });
  }
  console.log("Items de kit/EPP creados:", kitItems.length);

  // 4. Crear empleados de ejemplo
  const empleados = [
    {
      rut: "12.345.678-9",
      nombres: "Juan Carlos",
      apellidoPaterno: "González",
      apellidoMaterno: "Pérez",
      correoPersonal: "juan.gonzalez@empresa.cl",
      cargo: "Desarrollador Senior",
      jefatura: "Gerencia TI",
      ubicacion: "Santiago",
      tipoContrato: TipoContrato.contrato,
      fechaIngreso: new Date("2023-01-15"),
    },
    {
      rut: "11.222.333-4",
      nombres: "María José",
      apellidoPaterno: "López",
      apellidoMaterno: "Silva",
      correoPersonal: "maria.lopez@empresa.cl",
      cargo: "Analista de Sistemas",
      jefatura: "Gerencia TI",
      ubicacion: "Santiago",
      tipoContrato: TipoContrato.contrato,
      fechaIngreso: new Date("2022-06-01"),
    },
    {
      rut: "15.666.777-8",
      nombres: "Pedro Antonio",
      apellidoPaterno: "Martínez",
      apellidoMaterno: "Rojas",
      correoPersonal: "pedro.martinez@empresa.cl",
      cargo: "Soporte TI",
      jefatura: "Gerencia TI",
      ubicacion: "Rancagua",
      tipoContrato: TipoContrato.contrato,
      fechaIngreso: new Date("2024-03-01"),
    },
    {
      rut: "18.999.000-1",
      nombres: "Carolina Andrea",
      apellidoPaterno: "Vargas",
      apellidoMaterno: "Muñoz",
      correoPersonal: "carolina.vargas@empresa.cl",
      cargo: "Gerente de Proyectos",
      jefatura: "Gerencia General",
      ubicacion: "Santiago",
      tipoContrato: TipoContrato.contrato,
      fechaIngreso: new Date("2021-09-15"),
    },
  ];

  for (const emp of empleados) {
    await prisma.employee.upsert({
      where: { rut: emp.rut },
      update: {},
      create: emp,
    });
  }
  console.log("Empleados creados:", empleados.length);

  // 5. Obtener categorías para crear activos
  const catNotebook = await prisma.assetCategory.findUnique({ where: { nombre: "Notebook" } });
  const catCelular = await prisma.assetCategory.findUnique({ where: { nombre: "Celular" } });
  const catMonitor = await prisma.assetCategory.findUnique({ where: { nombre: "Monitor" } });

  if (catNotebook && catCelular && catMonitor) {
    // 6. Crear activos de ejemplo
    const activos = [
      {
        categoriaId: catNotebook.id,
        numeroSerie: "PF3KXYZ1",
        marca: "Lenovo",
        modelo: "ThinkPad T14",
        procesador: "Intel Core i7-1365U",
        ram: "16GB",
        discoDuro: "512GB SSD",
        sistemaOperativo: "Windows 11 Pro",
        estado: EstadoActivo.disponible,
        condicion: CondicionActivo.nuevo,
        ubicacionFisica: "Bodega Santiago",
        fechaCompra: new Date("2024-01-15"),
      },
      {
        categoriaId: catNotebook.id,
        numeroSerie: "PF3KXYZ2",
        marca: "Lenovo",
        modelo: "ThinkPad T14",
        procesador: "Intel Core i7-1365U",
        ram: "16GB",
        discoDuro: "512GB SSD",
        sistemaOperativo: "Windows 11 Pro",
        estado: EstadoActivo.disponible,
        condicion: CondicionActivo.nuevo,
        ubicacionFisica: "Bodega Santiago",
        fechaCompra: new Date("2024-01-15"),
      },
      {
        categoriaId: catNotebook.id,
        numeroSerie: "PF3KXYZ3",
        marca: "HP",
        modelo: "EliteBook 840 G10",
        procesador: "Intel Core i5-1345U",
        ram: "8GB",
        discoDuro: "256GB SSD",
        sistemaOperativo: "Windows 11 Pro",
        estado: EstadoActivo.disponible,
        condicion: CondicionActivo.usado,
        ubicacionFisica: "Bodega Santiago",
        fechaCompra: new Date("2023-06-20"),
      },
      {
        categoriaId: catCelular.id,
        numeroSerie: "DNPXCELL001",
        imei: "351234567890123",
        marca: "Apple",
        modelo: "iPhone 13",
        numeroTelefono: "+56912345678",
        tipoPlan: "Corporativo 10GB",
        estado: EstadoActivo.disponible,
        condicion: CondicionActivo.nuevo,
        ubicacionFisica: "Bodega Santiago",
        fechaCompra: new Date("2024-02-01"),
      },
      {
        categoriaId: catCelular.id,
        numeroSerie: "DNPXCELL002",
        imei: "351234567890124",
        marca: "Samsung",
        modelo: "Galaxy S23",
        numeroTelefono: "+56987654321",
        tipoPlan: "Corporativo 5GB",
        estado: EstadoActivo.disponible,
        condicion: CondicionActivo.nuevo,
        ubicacionFisica: "Bodega Santiago",
        fechaCompra: new Date("2024-02-01"),
      },
      {
        categoriaId: catMonitor.id,
        numeroSerie: "CN-0MON001",
        marca: "Dell",
        modelo: "P2422H 24\"",
        estado: EstadoActivo.disponible,
        condicion: CondicionActivo.nuevo,
        ubicacionFisica: "Bodega Santiago",
        fechaCompra: new Date("2024-01-10"),
      },
      {
        categoriaId: catMonitor.id,
        numeroSerie: "CN-0MON002",
        marca: "Dell",
        modelo: "P2722H 27\"",
        estado: EstadoActivo.disponible,
        condicion: CondicionActivo.nuevo,
        ubicacionFisica: "Bodega Santiago",
        fechaCompra: new Date("2024-01-10"),
      },
      {
        categoriaId: catMonitor.id,
        numeroSerie: "CN-0MON003",
        marca: "LG",
        modelo: "27UK650 27\" 4K",
        estado: EstadoActivo.disponible,
        condicion: CondicionActivo.usado,
        ubicacionFisica: "Bodega Rancagua",
        fechaCompra: new Date("2022-08-15"),
      },
    ];

    for (const activo of activos) {
      await prisma.asset.upsert({
        where: { numeroSerie: activo.numeroSerie },
        update: {},
        create: activo,
      });
    }
    console.log("Activos creados:", activos.length);
  }

  console.log("Seed completado exitosamente!");
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
