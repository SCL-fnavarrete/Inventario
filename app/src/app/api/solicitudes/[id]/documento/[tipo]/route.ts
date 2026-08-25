import { NextRequest, NextResponse } from 'next/server';
import type { TipoDocumento } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  archivarDocumento,
  documentoArchivadoDe,
  obtenerDocumento,
  reemitir,
  ultimoDocumentoDe,
} from '@/lib/services/documentEmissionService';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  handleApiError,
  requirePermission,
} from '@/lib/auth/guard';

/**
 * Documentos de una solicitud: se entregan, no se generan.
 *
 * Esta ruta renderizaba el PDF en cada descarga consultando datos vivos. El
 * "acta" de una entrega de marzo listaba los equipos que la persona tuviera el
 * dia de la descarga —una devolucion posterior la vaciaba—, la fecha del pie
 * era la del clic, y dos descargas del mismo documento eran dos documentos
 * distintos. Nada de eso sirve como evidencia.
 *
 * Ahora GET devuelve los bytes archivados del documento inmutable, verificados
 * contra su hash. Si no existe, lo dice: el documento se emite con la
 * transicion que ejecuta el acto (SPEC 2.1 sexies), no al pedirlo.
 *
 * Esta ruta jamas marca a RRHH como notificada: eso es de la Ola 3.
 */

const TIPOS: Record<string, { enumerado: TipoDocumento; archivo: string }> = {
  'anexo-entrega': { enumerado: 'anexo_entrega', archivo: 'Anexo_Entrega_Equipos' },
  'comprobante-entrega': { enumerado: 'comprobante_entrega', archivo: 'Comprobante_Entrega' },
  'comprobante-cambio': { enumerado: 'comprobante_cambio', archivo: 'Comprobante_Cambio' },
  'acta-devolucion': { enumerado: 'acta_devolucion', archivo: 'Acta_Devolucion' },
};

async function resolverContexto(params: Promise<{ id: string; tipo: string }>) {
  const { id, tipo } = await params;
  const definicion = TIPOS[tipo];
  if (!definicion) {
    throw new ValidationError(
      `Tipo de documento inválido. Opciones: ${Object.keys(TIPOS).join(', ')}`
    );
  }

  const solicitud = await prisma.workflowRequest.findUnique({
    where: { id },
    select: { id: true, numero: true, tipo: true, estado: true },
  });
  if (!solicitud) throw new NotFoundError('Solicitud no encontrada');

  return { solicitud, definicion, contexto: { requestId: id, tipo: definicion.enumerado } };
}

// GET /api/solicitudes/[id]/documento/[tipo] — descarga el archivo inmutable
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tipo: string }> }
) {
  try {
    await requirePermission('solicitudes', 'read');
    const { definicion, contexto } = await resolverContexto(params);

    const archivado = await documentoArchivadoDe(contexto);
    if (!archivado) {
      // La diferencia importa: "nunca se emitio" es un 404; "se emitio pero el
      // archivo no llego a SharePoint" es un estado reintentable, no una
      // ausencia.
      const pendiente = await ultimoDocumentoDe(contexto);
      if (!pendiente) {
        return NextResponse.json(
          {
            error:
              'No se ha emitido un documento oficial de este tipo para la solicitud. Se emite al ejecutar la transición correspondiente.',
          },
          { status: 404 }
        );
      }
      return NextResponse.json(
        {
          error: `El documento ${pendiente.numero} v${pendiente.version} está ${pendiente.archivoEstado} de archivo y todavía no puede descargarse`,
          details: {
            documentoId: pendiente.id,
            numero: pendiente.numero,
            version: pendiente.version,
            archivoEstado: pendiente.archivoEstado,
            intentosArchivo: pendiente.intentosArchivo,
          },
        },
        { status: 409 }
      );
    }

    const documento = await obtenerDocumento(archivado.id);
    const nombre = `${definicion.archivo}_${documento.numero}_v${documento.version}.pdf`;

    return new NextResponse(new Uint8Array(documento.contenido), {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        'X-Documento-Numero': documento.numero,
        'X-Documento-Version': String(documento.version),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener documento');
  }
}

// POST /api/solicitudes/[id]/documento/[tipo] — reintenta el archivo o reemite
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tipo: string }> }
) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { contexto } = await resolverContexto(params);

    const cuerpo = (await request.json().catch(() => ({}))) as {
      reemitir?: boolean;
      motivo?: string;
    };

    const documento = await ultimoDocumentoDe(contexto);
    if (!documento) {
      throw new ConflictError(
        'No hay un documento emitido para reintentar. La evidencia se emite al ejecutar la transición del acto; un documento creado ahora no representaría lo que ocurrió entonces.'
      );
    }

    const emisor = session.user?.name || session.user?.email || 'Sistema';

    if (cuerpo.reemitir) {
      const motivo = (cuerpo.motivo || '').trim();
      if (!motivo) {
        throw new ValidationError('La reemisión requiere un motivo');
      }
      const nueva = await reemitir({ documentoId: documento.id, motivo, emitidoPor: emisor });
      const archivo = await archivarDocumento(nueva.documentoId);
      return NextResponse.json({
        documentoId: nueva.documentoId,
        numero: nueva.numero,
        version: nueva.version,
        archivoEstado: archivo.archivoEstado,
        sharepointUrl: archivo.sharepointUrl,
        error: archivo.error,
      });
    }

    if (documento.archivoEstado === 'archivado') {
      throw new ConflictError(
        `El documento ${documento.numero} v${documento.version} ya está archivado. Para generar una copia nueva, solicite una reemisión con motivo.`
      );
    }

    const archivo = await archivarDocumento(documento.id);
    return NextResponse.json({
      documentoId: documento.id,
      numero: documento.numero,
      version: documento.version,
      archivoEstado: archivo.archivoEstado,
      sharepointUrl: archivo.sharepointUrl,
      error: archivo.error,
    });
  } catch (error) {
    return handleApiError(error, 'Error al emitir documento');
  }
}
