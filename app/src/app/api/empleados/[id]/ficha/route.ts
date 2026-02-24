import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/empleados/[id]/ficha - Obtener ficha completa del empleado (la ficha azul)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Intentar buscar por UUID primero, luego por RUT
    let employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        // Asignaciones activas de equipos
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
        // Kit de bienvenida y EPP entregados
        kitAssignments: {
          include: {
            item: true,
          },
          orderBy: { fechaEntrega: "desc" },
        },
        // Historial de todas las asignaciones
        activosActuales: {
          include: {
            categoria: true,
          },
        },
      },
    });

    // Si no se encuentra por UUID, intentar buscar por RUT
    if (!employee) {
      employee = await prisma.employee.findUnique({
        where: { rut: id },
        include: {
          // Asignaciones activas de equipos
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
          // Kit de bienvenida y EPP entregados
          kitAssignments: {
            include: {
              item: true,
            },
            orderBy: { fechaEntrega: "desc" },
          },
          // Historial de todas las asignaciones
          activosActuales: {
            include: {
              categoria: true,
            },
          },
        },
      });
    }

    if (!employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    // Organizar datos para la ficha azul
    const activeAssignments = employee.assignments.filter((a) => a.activo);

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

    // Kit de bienvenida y EPP - Simplificado con fechas
    const kitEntregado = !!employee.fechaEntregaKit;
    const eppEntregado = !!employee.fechaEntregaEpp;

    const ficha = {
      // Datos personales
      empleado: {
        id: employee.id,
        rut: employee.rut,
        nombreCompleto: `${employee.nombres} ${employee.apellidoPaterno} ${employee.apellidoMaterno || ""}`.trim(),
        nombres: employee.nombres,
        apellidoPaterno: employee.apellidoPaterno,
        apellidoMaterno: employee.apellidoMaterno,
        correo: employee.correo,
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

      // Kit de bienvenida - Simplificado
      kitBienvenida: {
        entregado: kitEntregado,
        fechaEntrega: employee.fechaEntregaKit,
      },

      // EPP - Simplificado
      epp: {
        entregado: eppEntregado,
        fechaEntrega: employee.fechaEntregaEpp,
        proximaMantencion: employee.proximaMantencionEpp,
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
    console.error("Error fetching employee ficha:", error);
    return NextResponse.json(
      { error: "Error al obtener ficha del empleado" },
      { status: 500 }
    );
  }
}
