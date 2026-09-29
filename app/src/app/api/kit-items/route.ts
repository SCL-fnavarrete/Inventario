import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { requirePermission, handleApiError, errorRepetido } from '@/shared/auth/guard';
import { filtroSede, sedeIdParaCrear } from '@/shared/sedes/filtro';
import { exigirSedeActiva } from "@/shared/sedes/consultas";
import { createKitItemSchema } from '@/modules/kit-epp';
import { auditLogService } from '@/shared/auditoria';

// GET /api/kit-items?categoria=kit_bienvenida|epp
// Catalogo de articulos de Kit de Bienvenida y EPP, con su stock actual.
// Separado de /api/activos porque no son equipos. Catalogo por sede; la
// sede del navbar filtra (SPEC 2.117).
export async function GET(request: NextRequest) {
  try {
    await requirePermission('kitEpp', 'read');

    const categoria = request.nextUrl.searchParams.get('categoria');
    const sedeIdFiltro = request.nextUrl.searchParams.get("sedeId") || "";

    const items = await prisma.welcomeKitItem.findMany({
      where: {
        ...(categoria ? { categoria: categoria as 'kit_bienvenida' | 'epp' } : {}),
        ...filtroSede(sedeIdFiltro),
      },
      // El nombre de la sede, para la lista con varias sedes mezcladas.
      include: { sede: { select: { nombre: true } } },
      orderBy: { nombre: 'asc' },
    });

    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error, 'Error al obtener artículos de Kit/EPP');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('kitEpp', 'write');

    const body = await request.json();
    const validated = createKitItemSchema.parse(body);
    // Obligatoria: un articulo sin sede no aparece al filtrar por sede.
    const sedeId = sedeIdParaCrear(validated.sedeId, { requerido: true });
    if (sedeId) await exigirSedeActiva(sedeId);

    // El nombre no se duplica dentro de la misma sede/categoria, pero dos
    // sedes distintas si pueden tener un articulo con el mismo nombre --
    // son catalogos independientes.
    const existing = await prisma.welcomeKitItem.findFirst({
      where: {
        nombre: { equals: validated.nombre, mode: 'insensitive' },
        categoria: validated.categoria,
        sedeId,
      },
    });
    if (existing) {
      throw errorRepetido('nombre', 'Ya existe un artículo con ese nombre en esta categoría para esta sede');
    }

    const item = await prisma.welcomeKitItem.create({
      data: {
        nombre: validated.nombre.trim(),
        categoria: validated.categoria,
        cantidad: validated.cantidad,
        stockMinimo: validated.stockMinimo,
        sedeId,
      },
    });

    // Auditoria generica.
    await auditLogService.registrarCreacion(
      'kit_item',
      item.id,
      `Artículo de Kit/EPP creado: ${item.nombre} (${item.categoria})`,
      { nombre: item.nombre, categoria: item.categoria, cantidad: item.cantidad, sedeId: item.sedeId },
      session.user?.email
    );

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear artículo de Kit/EPP');
  }
}
