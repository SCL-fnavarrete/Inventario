import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { leerPaginacion } from "@/shared/utilidades/paginacion";
import { EstadoGuia, Prisma } from "@prisma/client";
import {
  requirePermission,
  handleApiError,
  respuestaErroresCampos,
  errorDeCampo,
} from '@/shared/auth/guard';
import { sedeIdParaCrear } from '@/shared/sedes/filtro';
import { ACTIVOS_VIGENTES } from '@/modules/activos/consultas';
import {
  VISTAS_GUIA,
  type VistaGuia,
} from '@/modules/despachos/consultas';
import { crearDespacho, crearGuiaConNumero, sedeDestinoValida } from '@/modules/despachos/servicio';
import { ETIQUETAS_GUIA, validarNuevaGuia } from '@/modules/despachos/validaciones';
import { etiquetaEstadoActivo } from '@/modules/activos/estados';
import { coincideBusqueda } from '@/shared/utilidades/text';
import { ordenarComo, paginarCoincidencias } from "@/shared/utilidades/busquedaEnMemoria";
import { identificadorActivo } from '@/modules/activos/identificador';

// GET /api/guias-despacho - Listar guías de despacho
export async function GET(request: NextRequest) {
  try {
    await requirePermission('guias', 'read');
    const searchParams = request.nextUrl.searchParams;
    const estado = searchParams.get("estado") as EstadoGuia | null;
    const busqueda = searchParams.get("busqueda");
    const { page, limit } = leerPaginacion(searchParams);

    const condiciones: Prisma.DispatchGuideWhereInput[] = [];

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
          ? VISTAS_GUIA.por_recibir(sedeIdFiltro || null)
          : VISTAS_GUIA[vista]()
      );
    }
    if (sedeIdFiltro) {
      condiciones.push({
        OR: [{ sedeId: sedeIdFiltro }, { sedeDestinoId: sedeIdFiltro }],
      });
    }

    const where = { AND: condiciones };

    const includeGuia = {
      _count: { select: { items: true, kitItems: true } },
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
      // Solo las columnas de busqueda; el detalle, solo de la pagina.
      const candidatas = await prisma.dispatchGuide.findMany({
        where,
        orderBy: { createdAt: "desc" },
        select: { id: true, numero: true, otChilexpress: true, receptorNombre: true, receptorRut: true },
      });
      // RUT del receptor sin formato, o palabra por palabra (coincideBusqueda).
      const pagina = paginarCoincidencias(
        candidatas,
        (g) =>
          coincideBusqueda(terminoBusqueda, {
            rut: g.receptorRut,
            campos: [g.numero, g.otChilexpress, g.receptorNombre],
          }),
        (page - 1) * limit,
        limit
      );

      total = pagina.total;
      guides = ordenarComo(
        pagina.ids,
        await prisma.dispatchGuide.findMany({ where: { id: { in: pagina.ids } }, include: includeGuia })
      );
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
    const { otChilexpress, fechaDespacho, fechaEstimadaLlegada, receptorNombre, receptorRut, observaciones, sedeDestinoId } =
      body;

    // Mismas reglas que la pantalla (SPEC 2.104), con el campo de cada error.
    const invalido = respuestaErroresCampos(validarNuevaGuia(body), ETIQUETAS_GUIA);
    if (invalido) return invalido;
    // Un equipo repetido en la lista se despacha una sola vez.
    const assetIds = [...new Set(body.assetIds as string[])];

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
        .map((a) => `${a.marca} ${a.modelo} (${identificadorActivo(a, "sin serie")}): ${etiquetaEstadoActivo(a.estado)}`)
        .join("; ");
      throw errorDeCampo("assetIds", `Ya no están disponibles para despacho: ${detalle}`);
    }

    // La sede origen es obligatoria y todos los equipos deben ser de ella:
    // una guia no mezcla equipos de sedes distintas.
    const sedeId = sedeIdParaCrear((body as { sedeId?: string }).sedeId, {
      requerido: true,
    });
    const deOtraSede = assets.filter((a) => a.sedeId !== sedeId);
    if (sedeId && deOtraSede.length > 0) {
      const detalle = deOtraSede
        .map((a) => `${a.marca} ${a.modelo} (${a.sede?.nombre ?? "sin sede"})`)
        .join("; ");
      throw errorDeCampo("assetIds", `No son de la sede origen: ${detalle}`);
    }

    // Existe, esta activa y no es la de origen (SPEC 2.108).
    const sedeDestino = await sedeDestinoValida(sedeDestinoId, sedeId);

    // El numero se toma dentro de la transaccion; si otra guia simultanea ya
    // lo uso, se reintenta con el siguiente (SPEC 2.108). La creacion es la
    // misma que usa el reparto de una compra (crearDespacho, SPEC 2.111).
    const guide = await crearGuiaConNumero((numero, tx) =>
      crearDespacho(tx, numero, {
        envio: { otChilexpress, fechaDespacho, fechaEstimadaLlegada, receptorNombre, receptorRut, observaciones },
        sedeId,
        sedeDestino,
        equipos: assets.map((a) => ({ id: a.id, estado: a.estado, sedeId: a.sedeId })),
        emisor: session.user.name || session.user.email || "Técnico",
        usuario: session.user?.email || "sistema",
      })
    );

    return NextResponse.json(guide, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear el despacho');
  }
}
