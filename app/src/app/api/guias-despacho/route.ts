import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EstadoGuia, Prisma } from "@prisma/client";
import {
  requirePermission,
  handleApiError,
  respuestaErroresCampos,
  errorDeCampo,
} from '@/lib/auth/guard';
import { tieneVisibilidadTotal, sedeIdParaCrear } from '@/lib/auth/sedeScope';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import {
  VISTAS_GUIA,
  sedePropiaGuias,
  whereGuiaVisible,
  type VistaGuia,
} from '@/lib/queries/guias';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { crearGuiaConNumero } from '@/lib/services/guiaDespachoService';
import { auditLogService } from '@/lib/services/auditLogService';
import { formatearRut } from '@/lib/validations/rut';
import { ETIQUETAS_GUIA, validarNuevaGuia } from '@/lib/validations/guia';
import { etiquetaEstadoActivo } from '@/lib/constants/estadosActivo';
import { coincideBusqueda } from '@/lib/utils/text';

// GET /api/guias-despacho - Listar guías de despacho
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('guias', 'read');
    const searchParams = request.nextUrl.searchParams;
    const estado = searchParams.get("estado") as EstadoGuia | null;
    const busqueda = searchParams.get("busqueda");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    const condiciones: Prisma.DispatchGuideWhereInput[] = [whereGuiaVisible(session)];

    if (estado) {
      condiciones.push({ estado });
    }

    // Filtrar por AMBAS puntas: una guia interesa tanto a la sede que
    // despacha como a la que recibe.
    const sedeIdFiltro = searchParams.get("sedeId") || "";

    // Tarjeta pulsada (SPEC 2.108): misma condicion que cuenta la tarjeta.
    const vista = searchParams.get("vista") as VistaGuia | null;
    if (vista && vista in VISTAS_GUIA) {
      condiciones.push(
        vista === "por_recibir"
          ? VISTAS_GUIA.por_recibir(sedePropiaGuias(session, sedeIdFiltro))
          : VISTAS_GUIA[vista]()
      );
    }
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
    return handleApiError(error, 'Error al obtener los despachos');
  }
}

// POST /api/guias-despacho - Crear nueva guía de despacho (SPEC 2.108).
// Los equipos quedan "En tránsito" en la sede de origen: pasan a la sede
// destino recien cuando esta confirma que llegaron. Mientras tanto la sede de
// origen puede anular la guia.
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
      sedeDestinoId,
    } = body;

    // Mismas reglas que la pantalla (SPEC 2.104), con el campo de cada error.
    const invalido = respuestaErroresCampos(validarNuevaGuia(body), ETIQUETAS_GUIA);
    if (invalido) return invalido;
    const receptorRutFormateado = formatearRut(receptorRut);
    // Un equipo repetido en la lista se despacha una sola vez.
    const assetIds = [...new Set(body.assetIds as string[])];

    const sedeDestino = await prisma.sede.findUnique({ where: { id: sedeDestinoId } });
    if (!sedeDestino) throw errorDeCampo("sedeDestinoId", "La sede destino no existe");
    // La pantalla solo ofrece sedes activas; el servidor tambien lo exige (SPEC 2.108).
    if (!sedeDestino.activa) {
      throw errorDeCampo("sedeDestinoId", `La sede ${sedeDestino.nombre} está inactiva`);
    }

    // Verificar que los activos existen y están disponibles -- no se puede
    // despachar algo que ya esta asignado, en mantencion, de baja, etc.
    const assets = await prisma.asset.findMany({
      where: { ...ACTIVOS_VIGENTES, id: { in: assetIds } },
      include: { sede: { select: { nombre: true } } },
    });

    if (assets.length !== assetIds.length) {
      throw errorDeCampo(
        "assetIds",
        "Uno o más equipos ya no existen en el inventario. Vuelve a elegirlos."
      );
    }

    // El mensaje dice cual y por que (SPEC 2.108): puede haber cambiado
    // mientras se llenaba el formulario.
    const noDisponibles = assets.filter((a) => a.estado !== "disponible");
    if (noDisponibles.length > 0) {
      const detalle = noDisponibles
        .map((a) => `${a.marca} ${a.modelo} (${a.numeroSerie ?? "sin serie"}): ${etiquetaEstadoActivo(a.estado)}`)
        .join("; ");
      throw errorDeCampo("assetIds", `Ya no están disponibles para despacho: ${detalle}`);
    }

    // Defensa en profundidad: un no-admin no puede despachar activos que no
    // sean de su propia sede. Para admin la sede origen es obligatoria, para
    // evitar una guia sin sede emisora que mezcle equipos de sedes distintas.
    const sedeId = sedeIdParaCrear(session, (body as { sedeId?: string }).sedeId, {
      requerido: true,
    });
    const deOtraSede = assets.filter((a) => a.sedeId !== sedeId);
    if (sedeId && deOtraSede.length > 0) {
      const detalle = deOtraSede
        .map((a) => `${a.marca} ${a.modelo} (${a.sede?.nombre ?? "sin sede"})`)
        .join("; ");
      throw errorDeCampo("assetIds", `No son de la sede origen: ${detalle}`);
    }

    if (sedeId && sedeDestinoId === sedeId) {
      throw errorDeCampo("sedeDestinoId", "La sede destino debe ser distinta de la sede origen");
    }

    const emisor = session.user.name || session.user.email || "Técnico";

    // El numero se toma dentro de la transaccion; si otra guia simultanea ya
    // lo uso, se reintenta con el siguiente (SPEC 2.108).
    const guide = await crearGuiaConNumero(async (numero, tx) => {
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
          estado: EstadoGuia.en_transito,
          sedeId,
          sedeDestinoId,
          items: {
            create: assetIds.map((assetId) => ({ assetId })),
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
        `Despacho creado: ${nuevaGuia.numero} (OT ${otChilexpress})`,
        { sedeId, sedeDestinoId, cantidadEquipos: assetIds.length },
        session.user?.email,
        tx
      );

      for (const assetId of assetIds) {
        const sedeAnteriorId = assets.find((a) => a.id === assetId)?.sedeId ?? null;

        // Sigue en su sede hasta que llegue (SPEC 2.108).
        await tx.asset.update({
          where: { id: assetId },
          data: { estado: "en_transito" },
        });

        await assetHistoryService.registrar(
          {
            assetId,
            tipoEvento: 'traslado',
            descripcion: `Despachado a ${sedeDestino.nombre} en el despacho ${nuevaGuia.numero} (OT Chilexpress ${otChilexpress}): en tránsito`,
            datosAnteriores: { estado: "disponible", sedeId: sedeAnteriorId },
            datosNuevos: { estado: "en_transito", guideId: nuevaGuia.id, sedeDestinoId },
            usuarioSistema: session.user?.email,
          },
          tx
        );
      }

      return nuevaGuia;
    });

    return NextResponse.json(guide, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear el despacho');
  }
}
