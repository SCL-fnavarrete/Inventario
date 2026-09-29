import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { employeeFiltersSchema } from "@/modules/personas";
import { Prisma } from "@prisma/client";
import { coincideBusqueda } from "@/shared/utilidades/text";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { filtroSede } from '@/shared/sedes/filtro';

// GET /api/empleados - Listar empleados con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    await requirePermission('empleados', 'read');

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

    // Todas las sedes; la del navbar filtra (SPEC 2.117).
    const sedeIdFiltro = searchParams.get("sedeId") || "";
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
