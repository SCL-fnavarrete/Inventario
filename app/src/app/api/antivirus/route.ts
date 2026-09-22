import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from "@/lib/auth/guard";

// Catalogo de opciones para el campo "Antivirus" de Activo. Mismo patron que
// /api/categorias: lista para alimentar selects y crea opciones nuevas
// desde el formulario (boton "+ Agregar opcion").

export async function GET(request: NextRequest) {
  try {
    await requirePermission("activos", "read");
    const soloActivas = request.nextUrl.searchParams.get("activas") === "true";
    const conUso = request.nextUrl.searchParams.get("conUso") === "true";

    const opciones = await prisma.antivirus.findMany({
      where: soloActivas ? { activo: true } : undefined,
      orderBy: { nombre: "asc" },
    });

    if (!conUso || opciones.length === 0) {
      return NextResponse.json(opciones);
    }

    // Cuenta cuantos activos tienen cada nombre guardado como texto plano,
    // para avisar el impacto real antes de eliminar una opcion.
    const conteos = await prisma.asset.groupBy({
      by: ["antivirus"],
      where: { antivirus: { in: opciones.map((o) => o.nombre) } },
      _count: true,
    });
    const usoPorNombre = new Map(conteos.map((c) => [c.antivirus, c._count]));

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

    const existente = await prisma.antivirus.findFirst({
      where: { nombre: { equals: nombre, mode: "insensitive" } },
    });
    if (existente) {
      // Ya existe (activa o no): la reactiva en vez de duplicarla.
      const reactivada = existente.activo
        ? existente
        : await prisma.antivirus.update({ where: { id: existente.id }, data: { activo: true } });
      return NextResponse.json(reactivada);
    }

    const creada = await prisma.antivirus.create({ data: { nombre } });
    return NextResponse.json(creada, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Error al crear opcion");
  }
}
