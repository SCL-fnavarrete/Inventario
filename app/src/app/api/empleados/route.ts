import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createEmployeeSchema, employeeFiltersSchema } from "@/lib/validations/employee";
import { Prisma } from "@prisma/client";
import { normalizeRut } from "@/lib/utils/rut";
import { removeAccents, matchNoAccent } from "@/lib/utils/text";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { sedeWhere, sedeIdParaCrear, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { auditLogService } from '@/lib/services/auditLogService';

// GET /api/empleados - Listar empleados con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('empleados', 'read');

    const searchParams = request.nextUrl.searchParams;

    // Parsear y validar filtros
    const filtersResult = employeeFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      estado: searchParams.get("estado") || undefined,
      tipoContrato: searchParams.get("tipoContrato") || undefined,
      ubicacion: searchParams.get("ubicacion") || undefined,
      jefatura: searchParams.get("jefatura") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || "nombres",
      sortOrder: searchParams.get("sortOrder") || "asc",
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // Construir condiciones de búsqueda
    // Aislamiento por sede (SPEC 2.9): admin ve todo, el resto solo lo suyo.
    const where: Prisma.EmployeeWhereInput = { ...sedeWhere(session) };

    // Selector de sede del nav (Etapa 2): solo quien ya tiene visibilidad
    // total (admin/tecnico) puede acotar por una sede especifica.
    const sedeIdFiltro = searchParams.get("sedeId") || "";
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      where.sedeId = sedeIdFiltro;
    }

    // Un termino de solo espacios no es una busqueda: se ignora en vez de
    // filtrar por vacio, que no devolveria nada util.
    const terminoBusqueda = filters.search?.trim() ?? "";

    // Normalizar búsqueda: quitar puntos/guiones (RUT) y acentos
    const normalizedSearch = terminoBusqueda ? normalizeRut(terminoBusqueda) : "";

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

    // Se filtra en memoria para soportar RUT sin formato (15941817 matchea
    // 15.941.817-0) y texto sin acentos (Cesar matchea César). La base es
    // chica (<1000 empleados), asi que traerla entera es viable.
    //
    // Basta un caracter: antes se exigian dos, y con uno solo la peticion caia
    // a la rama sin filtro y devolvia TODOS los empleados. El usuario escribia
    // una letra y creia que el buscador estaba roto.
    if (terminoBusqueda) {
      const allEmployees = await prisma.employee.findMany({
        where: {
          ...sedeWhere(session),
          ...(sedeIdFiltro && tieneVisibilidadTotal(session) ? { sedeId: sedeIdFiltro } : {}),
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
          _count: {
            select: {
              assignments: { where: { activo: true } },
              kitAssignments: true,
              activosActuales: true,
            },
          },
        },
      });

      const searchTerms = removeAccents(terminoBusqueda.toLowerCase());

      const filtered = allEmployees.filter((emp) => {
        // 1. Buscar por RUT normalizado (sin puntos ni guiones)
        const empRutNormalized = emp.rut ? normalizeRut(emp.rut) : "";
        if (normalizedSearch && empRutNormalized.includes(normalizedSearch)) {
          return true;
        }

        // 2. Buscar en campos de texto sin acentos
        if (matchNoAccent(emp.nombres, searchTerms)) return true;
        if (matchNoAccent(emp.apellidoPaterno, searchTerms)) return true;
        if (matchNoAccent(emp.apellidoMaterno, searchTerms)) return true;
        if (matchNoAccent(emp.correoPersonal, searchTerms)) return true;
        if (matchNoAccent(emp.correoEmpresa, searchTerms)) return true;
        if (matchNoAccent(emp.cargo, searchTerms)) return true;

        return false;
      });

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

    return NextResponse.json({
      data: employees,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener empleados');
  }
}

// POST /api/empleados - Crear nuevo empleado
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('empleados', 'write');

    const body = await request.json();

    // Validar datos
    const validationResult = createEmployeeSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // Verificar si ya existe un empleado con el mismo RUT (solo si se proporciona)
    if (data.rut) {
      const existingByRut = await prisma.employee.findUnique({
        where: { rut: data.rut },
      });

      if (existingByRut) {
        return NextResponse.json(
          { error: "Ya existe un empleado con este RUT" },
          { status: 409 }
        );
      }
    }

    // Verificar si ya existe un empleado con el mismo correo de empresa.
    // 15-sep-2026 (SPEC 2.39): este es el correo obligatorio, asi que es el
    // que siempre hay que comprobar; el personal solo si viene.
    const existingByCorreoEmpresa = await prisma.employee.findUnique({
      where: { correoEmpresa: data.correoEmpresa },
    });

    if (existingByCorreoEmpresa) {
      return NextResponse.json(
        { error: "Ya existe un empleado con este correo de empresa" },
        { status: 409 }
      );
    }

    if (data.correoPersonal) {
      const existingByEmail = await prisma.employee.findUnique({
        where: { correoPersonal: data.correoPersonal },
      });

      if (existingByEmail) {
        return NextResponse.json(
          { error: "Ya existe un empleado con este correo personal" },
          { status: 409 }
        );
      }
    }

    // La sede se hereda de quien registra al empleado; admin debe elegirla
    // explicitamente (requerido: true) -- ver nota en sedeIdParaCrear. Ver
    // SPEC 2.9.
    const sedeId = sedeIdParaCrear(session, (body as { sedeId?: string }).sedeId, {
      requerido: true,
    });

    // Crear empleado
    const employee = await prisma.employee.create({
      data: {
        sedeId,
        rut: data.rut,
        nombres: data.nombres,
        apellidoPaterno: data.apellidoPaterno,
        apellidoMaterno: data.apellidoMaterno,
        correoPersonal: data.correoPersonal,
        correoEmpresa: data.correoEmpresa,
        cargo: data.cargo,
        jefatura: data.jefatura,
        supervisor: data.supervisor,
        ubicacion: data.ubicacion,
        division: data.division,
        area: data.area,
        subArea: data.subArea,
        direccionParticular: data.direccionParticular,
        listasDistribucion: data.listasDistribucion,
        tipoContrato: data.tipoContrato,
        fechaIngreso: data.fechaIngreso,
        fechaTermino: data.fechaTermino,
        estado: data.estado,
        telefonoContacto: data.telefonoContacto,
      },
    });

    // Auditoria generica (SPEC 2.29): quien creo este empleado y con que
    // datos. No bloquea la respuesta si falla -- ver nota en registrar().
    await auditLogService.registrarCreacion(
      'empleado',
      employee.id,
      `Empleado creado: ${employee.nombres} ${employee.apellidoPaterno}`,
      { nombres: employee.nombres, apellidoPaterno: employee.apellidoPaterno, rut: employee.rut, sedeId: employee.sedeId },
      session.user?.email
    );

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear empleado');
  }
}
