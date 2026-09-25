import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requirePermission,
  handleApiError,
  respuestaErroresCampos,
  ConflictError,
} from '@/lib/auth/guard';
import { NotFoundError, ForbiddenError } from '@/lib/errors';
import { puedeConfirmarRecepcion } from '@/lib/queries/guias';
import { auditLogService } from '@/lib/services/auditLogService';
import {
  INCLUDE_DETALLE_GUIA,
  actualizarEstadoGuia,
  buscarGuiaVisible,
  recibirEquipos,
} from '@/lib/services/guiaDespachoService';
import { ETIQUETAS_GUIA, validarRecepcion } from '@/lib/validations/guia';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/guias-despacho/[id] - Obtener detalle de guía
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'read');
    const { id } = await params;
    return NextResponse.json(await buscarGuiaVisible(session, id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener guía de despacho');
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
    const { recibidoPor, fechaRecepcion, llegaron } = await request.json();

    const guia = await buscarGuiaVisible(session, id);
    if (!puedeConfirmarRecepcion(session, guia)) {
      throw new ForbiddenError('Solo la sede destino puede confirmar la recepción de esta guía');
    }
    if (guia.estado !== 'en_transito') {
      throw new ConflictError('Esta guía ya no está en tránsito: su recepción ya se confirmó o se anuló');
    }

    const errores = validarRecepcion({ recibidoPor, fechaRecepcion }, guia.fechaDespacho);
    const idsLlegaron = Array.isArray(llegaron) ? (llegaron as string[]) : [];
    if (idsLlegaron.length === 0) {
      errores.llegaron = "Marca al menos un equipo que llegó";
    }
    const invalido = respuestaErroresCampos(errores, ETIQUETAS_GUIA);
    if (invalido) return invalido;

    const usuario = session.user?.email || recibidoPor;
    const actualizada = await prisma.$transaction(async (tx) => {
      const recibidos = await recibirEquipos(tx, guia, idsLlegaron, usuario);
      if (recibidos === 0) throw new NotFoundError('Los equipos marcados no son de esta guía');

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
        `Guía de despacho ${guia.numero}: recepción confirmada por ${recibidoPor} (${recibidos} de ${guia.items.length} equipos)`,
        { estado: guia.estado },
        { estado, recibidoPor, recibidos },
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
