import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EstadoGuia } from "@prisma/client";
import { requirePermission, handleApiError, respuestaErroresCampos } from '@/lib/auth/guard';
import type { SesionAutenticada } from '@/lib/auth/guard';
import { tieneVisibilidadTotal, sedeIdParaCrear } from '@/lib/auth/sedeScope';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { generarNumeroGuia } from '@/lib/services/guiaDespachoService';
import { auditLogService } from '@/lib/services/auditLogService';
import { formatearRut } from '@/lib/validations/rut';
import { ETIQUETAS_GUIA, validarNuevaGuia } from '@/lib/validations/guia';
import { coincideBusqueda } from '@/lib/utils/text';

/**
 * Visibilidad de una guia de despacho: a diferencia del resto de modulos,
 * a una guia le importan DOS sedes -- la del emisor y la destino, porque
 * el tecnico receptor tambien necesita verla y confirmar su recepcion.
 * Admin ve todas.
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

    // Filtrar por AMBAS puntas: una guia interesa tanto a la sede que
    // despacha como a la que recibe.
    const sedeIdFiltro = searchParams.get("sedeId") || "";
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      condiciones.push({
        OR: [{ sedeId: sedeIdFiltro }, { sedeDestinoId: sedeIdFiltro }],
      });
    }

    const where = { AND: condiciones };

    const includeGuia = {
      _count: { select: { items: true } },
      // Sede origen ademas de destino, relevante para el filtro por ambas puntas.
      sede: true,
      sedeDestino: true,
    } as const;

    // Filtrado en memoria: normaliza el RUT (sin puntos/guion, ya que se
    // guarda formateado) e ignora acentos en los demas campos de texto.
    const terminoBusqueda = busqueda?.trim() ?? "";

    let guides;
    let total;

    if (terminoBusqueda) {
      const todas = await prisma.dispatchGuide.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: includeGuia,
      });

      // RUT del receptor sin formato, o palabra por palabra (coincideBusqueda).
      const filtradas = todas.filter((g) =>
        coincideBusqueda(terminoBusqueda, {
          rut: g.receptorRut,
          campos: [g.numero, g.otChilexpress, g.receptorNombre],
        })
      );

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

// POST /api/guias-despacho - Crear nueva guía de despacho.
// Crearla aplica de inmediato su efecto: cada activo pasa a la sede destino
// y queda disponible ahi. No existe estado "pendiente" y la guia no se
// puede anular; "Confirmar Recepción" despues es solo informativo.
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

    // Mismas reglas que la pantalla (SPEC 2.104), con el campo de cada error.
    const invalido = respuestaErroresCampos(validarNuevaGuia(body), ETIQUETAS_GUIA);
    if (invalido) return invalido;
    const receptorRutFormateado = formatearRut(receptorRut);

    const sedeDestino = await prisma.sede.findUnique({ where: { id: sedeDestinoId } });
    if (!sedeDestino) {
      return NextResponse.json(
        { error: "Sede destino no encontrada" },
        { status: 400 }
      );
    }

    // Generar número de guía usando la lógica compartida con GET /numero.
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
    // sean de su propia sede. Para admin la sede origen es obligatoria, para
    // evitar una guia sin sede emisora que mezcle equipos de sedes distintas.
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

      // Auditoria generica: quien creo la guia de despacho.
      await auditLogService.registrarCreacion(
        'guia_despacho',
        nuevaGuia.id,
        `Guía de despacho creada: ${nuevaGuia.numero} (OT ${otChilexpress})`,
        { sedeId, sedeDestinoId, cantidadEquipos: (assetIds as string[]).length },
        session.user?.email,
        tx
      );

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
