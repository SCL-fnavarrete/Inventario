import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import {
  requirePermission,
  handleApiError,
  respuestaErroresCampos,
  ConflictError,
} from '@/shared/auth/guard';
import { NotFoundError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import {
  INCLUDE_DETALLE_GUIA,
  actualizarEstadoGuia,
  buscarGuia,
  recibirEquipos,
  resolverKit,
} from '@/modules/despachos/servicio';
import { ETIQUETAS_GUIA, validarRecepcion } from '@/modules/despachos/validaciones';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/guias-despacho/[id] - Obtener detalle de guía
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('guias', 'read');
    const { id } = await params;
    return NextResponse.json(await buscarGuia(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener el despacho');
  }
}

// PATCH /api/guias-despacho/[id] - Confirmar la recepción (SPEC 2.108).
// La sede destino marca los equipos que llegaron: esos pasan a su inventario
// como "Disponible". Los que no, siguen "En tránsito" y la guía queda "con
// faltantes" hasta resolverlos uno a uno (llegó / se perdió).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'write');
    const { id } = await params;
    const { recibidoPor, fechaRecepcion, llegaron, kitRecibido } = await request.json();

    const guia = await buscarGuia(id);
    if (guia.estado !== 'en_transito') {
      throw new ConflictError('Este despacho ya no está en tránsito: su recepción ya se confirmó o se anuló');
    }

    const errores = validarRecepcion({ recibidoPor, fechaRecepcion }, guia.fechaDespacho);
    const idsLlegaron = Array.isArray(llegaron) ? (llegaron as string[]) : [];
    // Kit/EPP (SPEC 2.111.4): cuantas unidades de cada linea llegaron.
    const kitLlego = (Array.isArray(kitRecibido) ? (kitRecibido as { lineaId: string; cantidad: number }[]) : [])
      .map((k) => ({ lineaId: String(k.lineaId), cantidad: Number(k.cantidad) }))
      .filter((k) => k.cantidad > 0);
    if (idsLlegaron.length === 0 && kitLlego.length === 0) {
      errores.llegaron = guia.kitItems.length > 0
        ? "Marca al menos un equipo o una cantidad de Kit/EPP que llegó"
        : "Marca al menos un equipo que llegó";
    }
    const invalido = respuestaErroresCampos(errores, ETIQUETAS_GUIA);
    if (invalido) return invalido;

    const usuario = session.user?.email || recibidoPor;
    const actualizada = await prisma.$transaction(async (tx) => {
      const recibidos = await recibirEquipos(tx, guia, idsLlegaron, usuario);
      if (idsLlegaron.length > 0 && recibidos === 0) {
        throw new NotFoundError('Los equipos marcados no son de este despacho');
      }
      for (const k of kitLlego) {
        await resolverKit(tx, guia, k.lineaId, 'llego', k.cantidad, usuario);
      }
      const unidadesKit = kitLlego.reduce((s, k) => s + k.cantidad, 0);

      await tx.dispatchGuide.update({
        where: { id },
        data: {
          recibidoPor,
          fechaRecepcion: fechaRecepcion ? new Date(fechaRecepcion) : new Date(),
        },
      });
      const estado = await actualizarEstadoGuia(tx, id, true);

      await auditLogService.registrarActualizacion(
        'guia_despacho',
        id,
        `Despacho ${guia.numero}: recepción confirmada por ${recibidoPor} (${recibidos} de ${guia.items.length} equipos${
          guia.kitItems.length > 0 ? `, ${unidadesKit} unidad(es) de Kit/EPP` : ''
        })`,
        { estado: guia.estado },
        { estado, recibidoPor, recibidos, unidadesKit },
        session.user?.email,
        tx
      );

      return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
    });

    return NextResponse.json(actualizada);
  } catch (error) {
    return handleApiError(error, 'Error al confirmar la recepción');
  }
}
