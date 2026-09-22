import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from "@/lib/auth/guard";

// Catalogo de opciones para el campo "Sistema operativo" de Activo. Mismo patron que
// /api/categorias: lista para alimentar selects y crea opciones nuevas
// desde el formulario (boton "+ Agregar opcion").

export async function GET(request: NextRequest) {
  try {
    await requirePermission("activos", "read");
    const soloActivas = request.nextUrl.searchParams.get("activas") === "true";
    const conUso = request.nextUrl.searchParams.get("conUso") === "true";

    const opciones = await prisma.sistemaOperativo.findMany({
      where: soloActivas ? { activo: true } : undefined,
      orderBy: { nombre: "asc" },
    });

    if (!conUso || opciones.length === 0) {
      return NextResponse.json(opciones);
    }

    // Cuenta cuantos activos tienen cada nombre guardado como texto plano,
    // para avisar el impacto real antes de eliminar una opcion.
    const conteos = await prisma.asset.groupBy({
      by: ["sistemaOperativo"],
      where: { sistemaOperativo: { in: opciones.map((o) => o.nombre) } },
      _count: true,
    });
    const usoPorNombre = new Map(conteos.map((c) => [c.sistemaOperativo, c._count]));

    return NextResponse.json(
      opciones.map((o) => ({ ...o, enUso: usoPorNombre.get(o.nombre) ?? 0 }))
    );
  } catch (error) {
    return handleApiError(error, "Error al obtener opciones");
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("activos", "write");
    const body = await request.json();
    const nombre = (body.nombre ?? "").trim();

    if (!nombre) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const existente = await prisma.sistemaOperativo.findFirst({
      where: { nombre: { equals: nombre, mode: "insensitive" } },
    });
    if (existente) {
      // Ya existe (activa o no): la reactiva en vez de duplicarla.
      const reactivada = existente.activo
        ? existente
        : await prisma.sistemaOperativo.update({ where: { id: existente.id }, data: { activo: true } });
      return NextResponse.json(reactivada);
    }

    const creada = await prisma.sistemaOperativo.create({ data: { nombre } });
    return NextResponse.json(creada, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Error al crear opcion");
  }
}
