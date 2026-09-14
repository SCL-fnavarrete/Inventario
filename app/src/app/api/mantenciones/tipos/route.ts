import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { createMaintenanceTypeSchema } from '@/lib/validations/maintenanceType';
import { auditLogService } from '@/lib/services/auditLogService';

// GET /api/mantenciones/tipos - Listar tipos de mantencion
// Catalogo global (sin sedeId, igual que AssetCategory) -- ver nota en
// prisma/schema.prisma (model MaintenanceType).
export async function GET(request: NextRequest) {
  try {
    await requirePermission('tiposMantencion', 'read');

    const searchParams = request.nextUrl.searchParams;
    const soloActivos = searchParams.get('activo') === 'true';
    const includeCount = searchParams.get('includeCount') === 'true';

    const tipos = await prisma.maintenanceType.findMany({
      where: soloActivos ? { activo: true } : undefined,
      orderBy: { nombre: 'asc' },
      ...(includeCount && {
        include: {
          _count: {
            select: { maintenances: true },
          },
        },
      }),
    });

    return NextResponse.json(tipos);
  } catch (error) {
    return handleApiError(error, 'Error al obtener tipos de mantención');
  }
}

// POST /api/mantenciones/tipos - Crear tipo de mantencion
// Admin y tecnico pueden crear (recurso "tiposMantencion": AMBOS en
// write), a diferencia de Categorias donde solo admin escribe.
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('tiposMantencion', 'write');

    const body = await request.json();
    const validationResult = createMaintenanceTypeSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const { nombre, descripcion } = validationResult.data;

    const existing = await prisma.maintenanceType.findFirst({
      where: { nombre: { equals: nombre.trim(), mode: 'insensitive' } },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un tipo de mantención con ese nombre' },
        { status: 400 }
      );
    }

    const tipo = await prisma.maintenanceType.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
      },
    });

    // Auditoria generica (SPEC 2.31).
    await auditLogService.registrarCreacion(
      'tipo_mantencion',
      tipo.id,
      `Tipo de mantención creado: ${tipo.nombre}`,
      { nombre: tipo.nombre, descripcion: tipo.descripcion },
      session.user?.email
    );

    return NextResponse.json(tipo, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear tipo de mantención');
  }
}
