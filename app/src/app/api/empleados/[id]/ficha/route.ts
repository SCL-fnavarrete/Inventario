import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

interface RouteParams {
  params: Promise<{ id: string }>;
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
} satisfies Prisma.EmployeeInclude;

// GET /api/empleados/[id]/ficha - Obtener ficha completa del empleado (la ficha azul)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('empleados', 'read');
    const { id } = await params;

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

    if (!employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    // La consulta ya trae solo las asignaciones activas.
    const activeAssignments = employee.assignments;

    // Separar por categoría - Soportar múltiples equipos por categoría
    const notebooks = activeAssignments.filter(
      (a) => a.asset.categoria.nombre.toLowerCase() === "notebook"
    );
    const celulares = activeAssignments.filter(
      (a) => a.asset.categoria.nombre.toLowerCase() === "celular"
    );
    const monitores = activeAssignments.filter(
      (a) => a.asset.categoria.nombre.toLowerCase() === "monitor"
    );
    const otrosEquipos = activeAssignments.filter(
      (a) =>
        !["notebook", "celular", "monitor"].includes(
          a.asset.categoria.nombre.toLowerCase()
        )
    );

    // Kit de bienvenida y EPP: se deducen de lo que efectivamente se
    // entrego (KitAssignment), no de las fechas sueltas del empleado
    // (16-sep-2026, SPEC 2.43). Antes se leian fechaEntregaKit/
    // fechaEntregaEpp, que solo se llenaban escribiendolas a mano en el
    // formulario de editar empleado -- una entrega real hecha desde una
    // Solicitud crea KitAssignment pero nunca tocaba esas fechas, asi que la
    // ficha mostraba "Pendiente" aunque el kit ya estuviera entregado. Al
    // sacarse esos campos del formulario, esta era la unica fuente que
    // quedaba viva.
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
        origenMicrosoft: employee.origenMicrosoft,
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
        // 15-sep-2026 (SPEC 2.41): la ficha mostraba solo el booleano
        // ("Microsoft 365: Si"). Lo util es cual plan tiene, asi que
        // ahora tambien viaja el nombre de la licencia.
        tipoLicenciaMicrosoft365: notebook.asset.tipoLicenciaMicrosoft365,
        estado: notebook.asset.estado,
        condicion: notebook.asset.condicion,
        fechaEntrega: notebook.fechaEntrega,
        lugarEntrega: notebook.lugarEntrega,
        entregadoPor: notebook.entregadoPor,
      })),

      // Celulares asignados (ahora array)
      celulares: celulares.map((celular) => ({
        asignacionId: celular.id,
        marca: celular.asset.marca,
        modelo: celular.asset.modelo,
        numeroSerie: celular.asset.numeroSerie,
        imei: celular.asset.imei,
        numeroTelefono: celular.asset.numeroTelefono,
        numeroActivacion: celular.asset.numeroActivacion,
        tipoPlan: celular.asset.tipoPlan,
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
        estado: a.asset.estado,
        condicion: a.asset.condicion,
        fechaEntrega: a.fechaEntrega,
      })),

      // Kit de bienvenida y EPP: solo el estado -- la fecha de entrega y la
      // proxima mantencion se sacaron de estas tarjetas en SPEC 2.41.
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

    return NextResponse.json(ficha);
  } catch (error) {
    return handleApiError(error, 'Error al obtener ficha del empleado');
  }
}
