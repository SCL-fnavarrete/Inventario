import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError, errorRepetido } from '@/lib/auth/guard';
import { auditLogService } from '@/lib/services/auditLogService';
import { crearSedeSchema } from '@/lib/validations/sede';
import { exigirNombreSedeLibre, USO_SEDE } from '@/lib/queries/sedes';

/**
 * CRUD de sedes. Solo admin puede escribir: son datos maestros.
 */

// GET /api/sedes - Listar sedes. Con ?conUso=true (Configuracion > Sedes)
// trae cuantos tecnicos activos y equipos tiene cada una, para avisar antes
// de desactivarla (SPEC 2.112.6).
export async function GET(request: NextRequest) {
  try {
    await requirePermission('sedes', 'read');
    const searchParams = request.nextUrl.searchParams;
    const soloActivas = searchParams.get('activas') === 'true';
    const conUso = searchParams.get('conUso') === 'true';

    const sedes = await prisma.sede.findMany({
      where: soloActivas ? { activa: true } : undefined,
      orderBy: { nombre: 'asc' },
      ...(conUso && { include: USO_SEDE }),
    });

    return NextResponse.json(sedes);
  } catch (error) {
    return handleApiError(error, "Error al obtener sedes");
  }
}

// POST /api/sedes - Crear nueva sede
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('sedes', 'write');
    const { codigo, nombre, activa } = crearSedeSchema.parse(await request.json());

    const existente = await prisma.sede.findUnique({ where: { codigo } });
    if (existente) {
      throw errorRepetido('codigo', 'Ya existe una sede con ese código');
    }
    await exigirNombreSedeLibre(nombre);

    const sede = await prisma.sede.create({
      data: { codigo, nombre, activa: activa ?? true },
    });

    // Registro de auditoria.
    await auditLogService.registrarCreacion(
      'sede',
      sede.id,
      `Sede creada: ${sede.nombre} (${sede.codigo})`,
      { codigo: sede.codigo, nombre: sede.nombre, activa: sede.activa },
      session.user?.email
    );

    return NextResponse.json(sede, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear sede');
  }
}
