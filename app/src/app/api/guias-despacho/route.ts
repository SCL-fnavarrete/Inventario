import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EstadoGuia } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import type { SesionAutenticada } from '@/lib/auth/guard';
import { tieneVisibilidadTotal, sedeIdParaCrear } from '@/lib/auth/sedeScope';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { generarNumeroGuia } from '@/lib/services/guiaDespachoService';
import { formatearRut, validarDigitoVerificador } from '@/lib/validations/rut';
import { normalizeRut } from '@/lib/utils/rut';
import { removeAccents, matchNoAccent } from '@/lib/utils/text';

/**
 * Visibilidad de una guia de despacho: a diferencia del resto de modulos
 * con aislamiento por sede (un solo `sedeId`), a una guia le importan DOS
 * sedes -- la de quien la crea (emisor) y la sede destino, porque el
 * tecnico que recibe el despacho tambien necesita verla y confirmar su
 * recepcion. Admin ve todas. Ver discusion de rediseño (10-sep-2026).
 */
function guiaWhereVisible(session: SesionAutenticada): Record<string, unknown> {
  if (tieneVisibilidadTotal(session)) return {};
  const sedeId = session.user.sedeId ?? '__sin_sede_asignada__';
  return { OR: [{ sedeId }, { sedeDestinoId: sedeId }] };
}

// GET /api/guias-despacho - Listar guías de despacho
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('guias', 'read');
    const searchParams = request.nextUrl.searchParams;
    const estado = searchParams.get("estado") as EstadoGuia | null;
    const busqueda = searchParams.get("busqueda");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    const condiciones: Record<string, unknown>[] = [guiaWhereVisible(session)];

    if (estado) {
      condiciones.push({ estado });
    }

    const where = { AND: condiciones };

    const includeGuia = {
      _count: { select: { items: true } },
      sedeDestino: true,
    } as const;

    // El termino de busqueda se filtra en memoria en vez de mandarlo a
    // Prisma como `contains` (11-sep-2026, mismo patron ya usado en
    // /api/empleados, /api/asignaciones y /api/solicitudes): `receptorRut`
    // se guarda formateado ("12.345.678-9", ver `formatearRut` en el POST
    // de abajo), asi que un `contains` directo contra lo que el usuario
    // escribe (casi siempre sin puntos) nunca hacia match. `normalizeRut`
    // saca puntos/guion de ambos lados antes de comparar; numero/OT
    // Chilexpress/receptor quedan sin distinguir acentos (`matchNoAccent`).
    const terminoBusqueda = busqueda?.trim() ?? "";

    let guides;
    let total;

    if (terminoBusqueda) {
      const normalizedSearch = normalizeRut(terminoBusqueda);
      const searchSinAcentos = removeAccents(terminoBusqueda.toLowerCase());

      const todas = await prisma.dispatchGuide.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: includeGuia,
      });

      const filtradas = todas.filter((g) => {
        if (matchNoAccent(g.numero, searchSinAcentos)) return true;
        if (matchNoAccent(g.otChilexpress, searchSinAcentos)) return true;
        if (matchNoAccent(g.receptorNombre, searchSinAcentos)) return true;

        const rutNormalizado = g.receptorRut ? normalizeRut(g.receptorRut) : "";
        if (normalizedSearch && rutNormalizado.includes(normalizedSearch)) return true;

        return false;
      });

      total = filtradas.length;
      guides = filtradas.slice((page - 1) * limit, (page - 1) * limit + limit);
    } else {
      [guides, total] = await Promise.all([
        prisma.dispatchGuide.findMany({
          where,
          include: includeGuia,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.dispatchGuide.count({ where }),
      ]);
    }

    return NextResponse.json({
      data: guides,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener guías de despacho');
  }
}

// POST /api/guias-despacho - Crear nueva guía de despacho
//
// A diferencia del diseño anterior, crear la guia APLICA de inmediato su
// efecto: cada activo pasa a la sede destino y queda disponible ahi. No
// existe un estado "pendiente" -- la guia es el comprobante de que el
// despacho ya se hizo (el tecnico ya lo llevo a Chilexpress), por eso no
// se puede anular. "Confirmar Recepción" despues es solo informativo. Ver
// discusion de rediseño (10-sep-2026).
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('guias', 'write');
    const body = await request.json();
    const {
      otChilexpress,
      fechaDespacho,
      fechaEstimadaLlegada,
      receptorNombre,
      receptorRut,
      observaciones,
      assetIds,
      sedeDestinoId,
    } = body;

    if (!otChilexpress || !fechaDespacho || !receptorNombre || !receptorRut || !sedeDestinoId) {
      return NextResponse.json(
        { error: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    if (!assetIds || assetIds.length === 0) {
      return NextResponse.json(
        { error: "Debe seleccionar al menos un activo" },
        { status: 400 }
      );
    }

    if (!validarDigitoVerificador(receptorRut)) {
      return NextResponse.json(
        { error: "El RUT del receptor no es válido" },
        { status: 400 }
      );
    }
    const receptorRutFormateado = formatearRut(receptorRut);

    const sedeDestino = await prisma.sede.findUnique({ where: { id: sedeDestinoId } });
    if (!sedeDestino) {
      return NextResponse.json(
        { error: "Sede destino no encontrada" },
        { status: 400 }
      );
    }

    // Generar número de guía (14-sep-2026, SPEC 2.26: unificado con
    // GET /api/guias-despacho/numero, que tenía esta misma lógica
    // duplicada sin usarla -- ver generarNumeroGuia()).
    const numero = await generarNumeroGuia();

    // Verificar que los activos existen y están disponibles -- no se puede
    // despachar algo que ya esta asignado, en mantencion, de baja, etc.
    const assets = await prisma.asset.findMany({
      where: { ...ACTIVOS_VIGENTES, id: { in: assetIds } },
    });

    if (assets.length !== assetIds.length) {
      return NextResponse.json(
        { error: "Algunos activos no fueron encontrados" },
        { status: 400 }
      );
    }

    if (assets.some((a) => a.estado !== "disponible")) {
      return NextResponse.json(
        { error: "Algunos activos no están disponibles para despacho" },
        { status: 400 }
      );
    }

    // Defensa en profundidad: un no-admin no puede despachar activos que no
    // sean de su propia sede, aunque el selector ya venga filtrado. Para
    // admin la sede origen ahora es obligatoria (requerido: true) -- el
    // formulario ya la pide (Nueva Guia de Despacho); dejarla en null hacia
    // que la guia quedara sin sede emisora, invisible para cualquier
    // tecnico "de origen" y permitia mezclar equipos de sedes distintas en
    // un mismo despacho. Ver SPEC 2.9.
    const sedeId = sedeIdParaCrear(session, (body as { sedeId?: string }).sedeId, {
      requerido: true,
    });
    if (sedeId && assets.some((a) => a.sedeId !== sedeId)) {
      return NextResponse.json(
        { error: "Algunos activos no pertenecen a tu sede" },
        { status: 400 }
      );
    }

    if (sedeId && sedeDestinoId === sedeId) {
      return NextResponse.json(
        { error: "La sede destino debe ser distinta de tu propia sede" },
        { status: 400 }
      );
    }

    const emisor = session.user.name || session.user.email || "Técnico";

    const guide = await prisma.$transaction(async (tx) => {
      const nuevaGuia = await tx.dispatchGuide.create({
        data: {
          numero,
          otChilexpress,
          fechaDespacho: new Date(fechaDespacho),
          fechaEstimadaLlegada: fechaEstimadaLlegada ? new Date(fechaEstimadaLlegada) : null,
          despachadoPor: emisor,
          receptorNombre,
          receptorRut: receptorRutFormateado,
          observaciones: observaciones || null,
          estado: EstadoGuia.despachado,
          sedeId,
          sedeDestinoId,
          items: {
            create: (assetIds as string[]).map((assetId) => ({ assetId })),
          },
        },
        include: {
          items: {
            include: {
              asset: { include: { categoria: true } },
            },
          },
          sedeDestino: true,
        },
      });

      for (const assetId of assetIds as string[]) {
        const sedeAnteriorId = assets.find((a) => a.id === assetId)?.sedeId ?? null;

        await tx.asset.update({
          where: { id: assetId },
          data: { sedeId: sedeDestinoId, estado: "disponible" },
        });

        await assetHistoryService.registrar(
          {
            assetId,
            tipoEvento: 'traslado',
            descripcion: `Despachado a ${sedeDestino.nombre} vía guía ${nuevaGuia.numero} (OT Chilexpress ${otChilexpress})`,
            datosAnteriores: { sedeId: sedeAnteriorId },
            datosNuevos: { sedeId: sedeDestinoId, guideId: nuevaGuia.id },
          },
          tx
        );
      }

      return nuevaGuia;
    });

    return NextResponse.json(guide, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear guía de despacho');
  }
}
