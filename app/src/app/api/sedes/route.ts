import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { auditLogService } from '@/lib/services/auditLogService';

/**
 * CRUD de sedes. Solo admin puede escribir, porque la sede define el
 * aislamiento de datos entre las distintas sedes.
 */

// GET /api/sedes - Listar sedes
export async function GET(request: NextRequest) {
  try {
    await requirePermission('sedes', 'read');
    const searchParams = request.nextUrl.searchParams;
    const soloActivas = searchParams.get('activas') === 'true';

    const sedes = await prisma.sede.findMany({
      where: soloActivas ? { activa: true } : undefined,
      orderBy: { nombre: 'asc' },
    });

    return NextResponse.json(sedes);
  } catch (error) {
    return handleApiError(error, 'Error al obtener sedes');
  }
}

// POST /api/sedes - Crear nueva sede
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('sedes', 'write');
    const body = await request.json();
    const { codigo, nombre } = body;

    if (!codigo || !codigo.trim()) {
      return NextResponse.json({ error: 'El código es requerido' }, { status: 400 });
    }
    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 });
    }

    const codigoNormalizado = codigo.trim().toUpperCase();

    const existente = await prisma.sede.findUnique({ where: { codigo: codigoNormalizado } });
    if (existente) {
      return NextResponse.json({ error: 'Ya existe una sede con ese código' }, { status: 409 });
    }

    const sede = await prisma.sede.create({
      data: {
        codigo: codigoNormalizado,
        nombre: nombre.trim(),
        activa: body.activa ?? true,
      },
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
