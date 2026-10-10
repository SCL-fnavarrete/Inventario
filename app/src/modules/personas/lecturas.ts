import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { NotFoundError, ValidationError } from '@/shared/errores';
import { filtroSede } from '@/shared/sedes/filtro';
import { coincideBusqueda } from '@/shared/utilidades/text';
import { formatearRut, limpiarRut, validarDigitoVerificador } from '@/shared/validaciones/rut';
import type { EmployeeFilters } from '@/modules/personas/validaciones';
import { LINEAS_DEL_EQUIPO } from '@/modules/activos';

/**
 * Lecturas de Personas contra la base (SPEC 3.2.2): la lista, la busqueda por
 * RUT, el detalle y la ficha.
 */

/** Lista con filtros y paginacion (GET /api/empleados). */
export async function listarEmpleados(filters: EmployeeFilters, sedeId: string | null) {
  const skip = (filters.page - 1) * filters.limit;

  // Todas las sedes; la del navbar filtra (SPEC 2.117).
  const sedeIdFiltro = sedeId || "";
  const where: Prisma.EmployeeWhereInput = filtroSede(sedeIdFiltro);

  // Un termino de solo espacios no es una busqueda: se ignora en vez de
  // filtrar por vacio, que no devolveria nada util.
  const terminoBusqueda = filters.search?.trim() ?? "";

  if (filters.estado) {
    where.estado = filters.estado;
  }

  if (filters.tipoContrato) {
    where.tipoContrato = filters.tipoContrato;
  }

  if (filters.ubicacion) {
    where.ubicacion = { contains: filters.ubicacion, mode: "insensitive" };
  }

  if (filters.jefatura) {
    where.jefatura = { contains: filters.jefatura, mode: "insensitive" };
  }

  let employees;
  let total;

  // Se filtra en memoria para soportar RUT sin formato y texto sin
  // acentos; el volumen de empleados es chico y traerlos todos es viable.
  if (terminoBusqueda) {
    const allEmployees = await prisma.employee.findMany({
      where: {
        ...filtroSede(sedeIdFiltro),
        // Aplicar filtros no-search (estado, tipoContrato, etc.)
        ...(filters.estado && { estado: filters.estado }),
        ...(filters.tipoContrato && { tipoContrato: filters.tipoContrato }),
        ...(filters.ubicacion && {
          ubicacion: { contains: filters.ubicacion, mode: "insensitive" },
        }),
        ...(filters.jefatura && {
          jefatura: { contains: filters.jefatura, mode: "insensitive" },
        }),
      },
      orderBy: { [filters.sortBy]: filters.sortOrder },
      include: {
        sede: { select: { id: true, nombre: true } },
        _count: {
          select: {
            assignments: { where: { activo: true } },
            kitAssignments: true,
            activosActuales: true,
          },
        },
      },
    });

    // RUT sin formato, o palabra por palabra sin acentos (coincideBusqueda):
    // "juan perez" encuentra a Juan Pérez.
    const filtered = allEmployees.filter((emp) =>
      coincideBusqueda(terminoBusqueda, {
        rut: emp.rut,
        campos: [
          emp.nombres,
          emp.apellidoPaterno,
          emp.apellidoMaterno,
          emp.correoPersonal,
          emp.correoEmpresa,
          emp.cargo,
        ],
      })
    );

    total = filtered.length;
    employees = filtered.slice(skip, skip + filters.limit);
  } else {
    // Sin búsqueda de texto: usar Prisma directamente
    [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        include: {
          sede: { select: { id: true, nombre: true } },
          _count: {
            select: {
              assignments: { where: { activo: true } },
              kitAssignments: true,
              activosActuales: true,
            },
          },
        },
      }),
      prisma.employee.count({ where }),
    ]);
  }

  return {
    data: employees,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

/** Lo que traen el detalle de una persona y la busqueda por RUT. */
const CON_EQUIPOS = {
  assignments: { include: { asset: { include: { categoria: true } } }, orderBy: { fechaEntrega: 'desc' } },
  kitAssignments: { include: { item: true } },
  activosActuales: { include: { categoria: true } },
} satisfies Prisma.EmployeeInclude;

/** Detalle de una persona por id o, si no, por RUT (GET /api/empleados/[id]). */
export async function detalleEmpleado(idORut: string) {
  const empleado =
    (await prisma.employee.findUnique({ where: { id: idORut }, include: CON_EQUIPOS })) ??
    (await prisma.employee.findUnique({ where: { rut: idORut }, include: CON_EQUIPOS }));
  if (!empleado) throw new NotFoundError('Empleado no encontrado');
  return empleado;
}

/**
 * Persona por RUT (GET /api/empleados/buscar): con o sin formato, o por el
 * cuerpo sin digito verificador. Devuelve tambien el RUT formateado buscado.
 */
export async function buscarEmpleadoPorRut(rut: string) {
  const rutLimpio = limpiarRut(rut);
  if (rutLimpio.length < 8 || !validarDigitoVerificador(rutLimpio)) throw new ValidationError('RUT inválido');
  const rutFormateado = formatearRut(rut);
  const empleado = await prisma.employee.findFirst({
    where: {
      OR: [{ rut: rutFormateado }, { rut: rutLimpio }, { rut: { contains: rutLimpio.slice(0, -1) } }],
    },
    include: {
      assignments: { where: { activo: true }, include: { asset: { include: { categoria: true } } } },
      kitAssignments: { where: { estado: 'entregado' }, include: { item: true } },
      activosActuales: { include: { categoria: true } },
    },
  });
  return { empleado, rutFormateado };
}

/**
 * Relaciones que necesita la ficha. Estaban escritas dos veces —una para la
 * busqueda por UUID y otra por RUT— y cualquier cambio en una sin la otra
 * hacia que la ficha devolviera datos distintos segun como se buscara.
 */
const RELACIONES_FICHA = {
  // Equipos actualmente en poder del empleado
  assignments: {
    where: { activo: true },
    include: {
      asset: {
        include: {
          categoria: true,
          lineas: LINEAS_DEL_EQUIPO,
        },
      },
    },
    orderBy: { fechaEntrega: "desc" },
  },
  // Accesorios del kit de bienvenida y EPP entregados
  kitAssignments: {
    include: {
      item: true,
    },
    orderBy: { fechaEntrega: "desc" },
  },
  // Lineas activas en su telefono personal (SPEC 2.131); las de un celular
  // de la empresa salen con ese celular.
  lineas: {
    where: { estado: { deBaja: false } },
    select: { id: true, numero: true },
    orderBy: { numero: "asc" },
  },
} satisfies Prisma.EmployeeInclude;

/** Ficha de una persona (la ficha azul, GET /api/empleados/[id]/ficha), por id o RUT. */
export async function fichaEmpleado(id: string) {
  // Intentar buscar por UUID primero, luego por RUT
  let employee = await prisma.employee.findUnique({
    where: { id },
    include: RELACIONES_FICHA,
  });

  // Si no se encuentra por UUID, intentar buscar por RUT
  if (!employee) {
    employee = await prisma.employee.findUnique({
      where: { rut: id },
      include: RELACIONES_FICHA,
    });
  }

  if (!employee) throw new NotFoundError("Empleado no encontrado");

  // La consulta ya trae solo las asignaciones activas.
  const activeAssignments = employee.assignments;

  // Separar por lo que pide cada categoria (SPEC 2.112.7), no por su
  // nombre: soporta varios equipos por tipo.
  const deFicha = (ficha: string) => activeAssignments.filter((a) => a.asset.categoria.tipoFicha === ficha);
  const notebooks = deFicha("computador");
  const celulares = deFicha("celular");
  const monitores = deFicha("monitor");
  const otrosEquipos = activeAssignments.filter(
    (a) => !["computador", "celular", "monitor"].includes(a.asset.categoria.tipoFicha)
  );

  // Kit de bienvenida y EPP se deducen de lo que efectivamente se entrego
  // (KitAssignment), no de fechas sueltas en el empleado.
  const kitEntregado = employee.kitAssignments.some(
    (k) => k.item.categoria === 'kit_bienvenida' && k.estado === 'entregado'
  );
  const eppEntregado = employee.kitAssignments.some(
    (k) => k.item.categoria === 'epp' && k.estado === 'entregado'
  );

  const ficha = {
    // Datos personales
    empleado: {
      id: employee.id,
      rut: employee.rut,
      nombreCompleto: `${employee.nombres} ${employee.apellidoPaterno} ${employee.apellidoMaterno || ""}`.trim(),
      nombres: employee.nombres,
      apellidoPaterno: employee.apellidoPaterno,
      apellidoMaterno: employee.apellidoMaterno,
      correoPersonal: employee.correoPersonal,
      correoEmpresa: employee.correoEmpresa,
      cargo: employee.cargo,
      jefatura: employee.jefatura,
      supervisor: employee.supervisor,
      ubicacion: employee.ubicacion,
      tipoContrato: employee.tipoContrato,
      fechaIngreso: employee.fechaIngreso,
      fechaTermino: employee.fechaTermino,
      estado: employee.estado,
      telefonoContacto: employee.telefonoContacto,
    },

    // Notebooks asignados (ahora array)
    notebooks: notebooks.map((notebook) => ({
      asignacionId: notebook.id,
      marca: notebook.asset.marca,
      modelo: notebook.asset.modelo,
      numeroSerie: notebook.asset.numeroSerie,
      procesador: notebook.asset.procesador,
      discoDuro: notebook.asset.discoDuro,
      ram: notebook.asset.ram,
      pulgadas: notebook.asset.pulgadas,
      sistemaOperativo: notebook.asset.sistemaOperativo,
      microsoft365: notebook.asset.microsoft365,
      // Nombre del plan de licencia, no solo si tiene o no Microsoft 365.
      tipoLicenciaMicrosoft365: notebook.asset.tipoLicenciaMicrosoft365,
      estado: notebook.asset.estado,
      condicion: notebook.asset.condicion,
      fechaEntrega: notebook.fechaEntrega,
      lugarEntrega: notebook.lugarEntrega,
      entregadoPor: notebook.entregadoPor,
    })),

    lineas: employee.lineas,

    // Celulares asignados (ahora array)
    celulares: celulares.map((celular) => ({
      asignacionId: celular.id,
      marca: celular.asset.marca,
      modelo: celular.asset.modelo,
      numeroSerie: celular.asset.numeroSerie,
      imei: celular.asset.imei,
      lineas: celular.asset.lineas,
      tieneCargador: celular.asset.tieneCargador,
      estado: celular.asset.estado,
      condicion: celular.asset.condicion,
      fechaEntrega: celular.fechaEntrega,
      lugarEntrega: celular.lugarEntrega,
      entregadoPor: celular.entregadoPor,
    })),

    // Monitores asignados (ahora array)
    monitores: monitores.map((monitor) => ({
      asignacionId: monitor.id,
      marca: monitor.asset.marca,
      modelo: monitor.asset.modelo,
      numeroSerie: monitor.asset.numeroSerie,
      pulgadas: monitor.asset.pulgadas,
      estado: monitor.asset.estado,
      condicion: monitor.asset.condicion,
      fechaEntrega: monitor.fechaEntrega,
      lugarEntrega: monitor.lugarEntrega,
      entregadoPor: monitor.entregadoPor,
    })),

    // Otros equipos (impresora, mouse, teclado, etc.)
    otrosEquipos: otrosEquipos.map((a) => ({
      asignacionId: a.id,
      categoria: a.asset.categoria.nombre,
      marca: a.asset.marca,
      modelo: a.asset.modelo,
      numeroSerie: a.asset.numeroSerie,
      imei: a.asset.imei,
      estado: a.asset.estado,
      condicion: a.asset.condicion,
      fechaEntrega: a.fechaEntrega,
    })),

    // Kit de bienvenida y EPP: solo el estado de entrega.
    kitBienvenida: {
      entregado: kitEntregado,
    },

    epp: {
      entregado: eppEntregado,
    },

    // Resumen
    resumen: {
      totalEquiposAsignados: activeAssignments.length,
      cantidadNotebooks: notebooks.length,
      cantidadCelulares: celulares.length,
      cantidadMonitores: monitores.length,
      cantidadOtrosEquipos: otrosEquipos.length,
      tieneNotebook: notebooks.length > 0,
      tieneCelular: celulares.length > 0,
      tieneMonitor: monitores.length > 0,
      kitBienvenidaEntregado: kitEntregado,
      eppEntregado: eppEntregado,
    },
  };

  return ficha;
}

/**
 * Lo que se le ha entregado a una persona a lo largo del tiempo: sus equipos
 * (con la fecha de entrega y de devolucion) y su Kit/EPP, sin importar si ya
 * lo devolvio (SPEC 2.132). Las lineas las lee Lineas; la ruta las junta.
 */
export async function asignacionesDeEmpleado(empleadoId: string) {
  if (!(await prisma.employee.findUnique({ where: { id: empleadoId }, select: { id: true } }))) {
    throw new NotFoundError('Empleado no encontrado');
  }
  const [equipos, kit] = await Promise.all([
    prisma.assignment.findMany({
      where: { employeeId: empleadoId },
      select: {
        id: true,
        fechaEntrega: true,
        fechaDevolucion: true,
        estadoDevolucion: true,
        activo: true,
        asset: { select: { id: true, marca: true, modelo: true, numeroSerie: true, imei: true, categoria: { select: { nombre: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.kitAssignment.findMany({
      where: { employeeId: empleadoId },
      select: { id: true, cantidad: true, fechaEntrega: true, estado: true, item: { select: { nombre: true, categoria: true } } },
      orderBy: { fechaEntrega: 'desc' },
    }),
  ]);
  return { equipos, kit };
}
