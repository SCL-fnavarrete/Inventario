import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createEmployeeSchema, employeeFiltersSchema } from "@/lib/validations/employee";
import { Prisma } from "@prisma/client";
import { normalizeRut } from "@/lib/utils/rut";

/**
 * Quita acentos/diacríticos de un string.
 * "César" → "cesar", "González" → "gonzalez"
 */
function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Compara un campo contra un término de búsqueda, ambos sin acentos.
 */
function matchNoAccent(field: string | null | undefined, searchTermNoAccent: string): boolean {
  if (!field) return false;
  return removeAccents(field).includes(searchTermNoAccent);
}

// GET /api/empleados - Listar empleados con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

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
      return NextResponse.json(
        { error: "Parámetros de búsqueda inválidos", details: filtersResult.error.issues },
        { status: 400 }
      );
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // Construir condiciones de búsqueda
    const where: Prisma.EmployeeWhereInput = {};

    // Normalizar búsqueda: quitar puntos/guiones (RUT) y acentos
    const normalizedSearch = filters.search ? normalizeRut(filters.search) : "";

    if (filters.search) {
      // Siempre traer todos y filtrar en memoria para soportar:
      // 1. RUT sin formato (15941817 → matchea 15.941.817-K)
      // 2. Sin acentos (Cesar → matchea César)
      // La base es chica (<1000 empleados) así que es viable
    }

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

    if (filters.search && filters.search.length >= 2) {
      // Búsqueda normalizada: sin acentos, sin puntos/guiones para RUT
      const allEmployees = await prisma.employee.findMany({
        where: {
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

      const searchTerms = removeAccents(filters.search.toLowerCase());

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
        if (matchNoAccent(emp.correo, searchTerms)) return true;
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
    console.error("Error fetching employees:", error);
    return NextResponse.json(
      { error: "Error al obtener empleados" },
      { status: 500 }
    );
  }
}

// POST /api/empleados - Crear nuevo empleado
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();

    // Validar datos
    const validationResult = createEmployeeSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
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

    // Verificar si ya existe un empleado con el mismo correo
    const existingByEmail = await prisma.employee.findUnique({
      where: { correo: data.correo },
    });

    if (existingByEmail) {
      return NextResponse.json(
        { error: "Ya existe un empleado con este correo" },
        { status: 409 }
      );
    }

    // Crear empleado
    const employee = await prisma.employee.create({
      data: {
        rut: data.rut,
        nombres: data.nombres,
        apellidoPaterno: data.apellidoPaterno,
        apellidoMaterno: data.apellidoMaterno,
        correo: data.correo,
        cargo: data.cargo,
        jefatura: data.jefatura,
        supervisor: data.supervisor,
        ubicacion: data.ubicacion,
        tipoContrato: data.tipoContrato,
        fechaIngreso: data.fechaIngreso,
        fechaTermino: data.fechaTermino,
        estado: data.estado,
        telefonoContacto: data.telefonoContacto,
      },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error("Error creating employee:", error);
    return NextResponse.json(
      { error: "Error al crear empleado" },
      { status: 500 }
    );
  }
}
