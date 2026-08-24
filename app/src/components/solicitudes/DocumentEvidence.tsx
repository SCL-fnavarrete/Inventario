'use client';

import { AlertCircle, CheckCircle, Clock, Download, FileText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Los documentos emitidos por una solicitud, con su estado de archivo.
 *
 * La transición ya calculaba el estado de cada documento y lo devolvía en el
 * 200, pero nadie lo leía: la ficha descartaba el cuerpo entero en el camino
 * feliz, y las rutas de descarga y reintento no tenían ningún consumidor. Un
 * documento que no se pudo archivar era invisible y, en la práctica,
 * irreparable desde la aplicación.
 */

export type DocumentoEvidencia = {
  id: string;
  numero: string;
  tipo: string;
  version: number;
  archivoEstado: 'pendiente' | 'archivado' | 'fallido';
  archivoError: string | null;
  intentosArchivo: number;
  emitidoPor: string;
  emitidoEn: string;
  motivoReemision: string | null;
};

const ETIQUETA_TIPO: Record<string, string> = {
  anexo_entrega: 'Anexo de entrega',
  comprobante_entrega: 'Comprobante de entrega',
  comprobante_cambio: 'Comprobante de cambio',
  acta_devolucion: 'Acta de devolución',
};

const ESTILO_ESTADO = {
  archivado: {
    icono: CheckCircle,
    clase: 'text-green-700 bg-green-50 border-green-200',
    etiqueta: 'Archivado',
  },
  fallido: {
    icono: AlertCircle,
    clase: 'text-red-700 bg-red-50 border-red-200',
    etiqueta: 'No se pudo archivar',
  },
  pendiente: {
    icono: Clock,
    clase: 'text-orange-700 bg-orange-50 border-orange-200',
    etiqueta: 'Pendiente de archivo',
  },
} as const;

function formatearFechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

export default function DocumentEvidence({
  solicitudId,
  documentos,
  puedeReintentar,
  onReintentar,
  reintentando,
}: {
  solicitudId: string;
  documentos: DocumentoEvidencia[];
  puedeReintentar: boolean;
  onReintentar: (tipo: string) => void;
  reintentando?: string | null;
}) {
  if (documentos.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Esta solicitud todavía no ha emitido documentos. Se emiten al registrar la entrega, el
        cambio o el cierre de la devolución.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {documentos.map((documento) => {
        const { icono: Icono, clase, etiqueta } = ESTILO_ESTADO[documento.archivoEstado];
        return (
          <li key={documento.id} className={cn('rounded-lg border p-4', clase)}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <p className="flex items-center gap-2 font-semibold">
                  <Icono size={16} />
                  {ETIQUETA_TIPO[documento.tipo] || documento.tipo}
                </p>
                <p className="flex items-center gap-1 text-sm">
                  <FileText size={12} />
                  {documento.numero} v{documento.version} · {etiqueta}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {documento.archivoEstado === 'archivado' && (
                  <a
                    href={`/api/solicitudes/${solicitudId}/documento/${documento.tipo}`}
                    className="flex items-center gap-1 rounded border border-current px-2 py-1 text-xs font-medium"
                  >
                    <Download size={12} />
                    Descargar
                  </a>
                )}
                {documento.archivoEstado !== 'archivado' && puedeReintentar && (
                  <button
                    type="button"
                    onClick={() => onReintentar(documento.tipo)}
                    disabled={reintentando === documento.tipo}
                    className="flex items-center gap-1 rounded border border-current px-2 py-1 text-xs font-medium disabled:opacity-50"
                  >
                    <RefreshCw size={12} />
                    Reintentar archivo
                  </button>
                )}
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <div className="flex gap-1">
                <dt className="text-gray-600">Emitido por:</dt>
                <dd>{documento.emitidoPor}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-gray-600">Emitido:</dt>
                <dd>{formatearFechaHora(documento.emitidoEn)}</dd>
              </div>
              {documento.intentosArchivo > 0 && (
                <div className="flex gap-1">
                  <dt className="text-gray-600">Intentos de archivo:</dt>
                  <dd>{documento.intentosArchivo}</dd>
                </div>
              )}
              {documento.motivoReemision && (
                <div className="flex gap-1 sm:col-span-2">
                  <dt className="text-gray-600">Motivo de reemisión:</dt>
                  <dd>{documento.motivoReemision}</dd>
                </div>
              )}
            </dl>

            {documento.archivoError && (
              <p className="mt-2 break-words rounded bg-white/60 p-2 font-mono text-xs">
                {documento.archivoError}
              </p>
            )}

            {documento.archivoEstado !== 'archivado' && (
              /* El documento existe y es válido: lo que falta es su copia
                 externa. Conviene que se lea así y no como "no hay acta". */
              <p className="mt-2 text-xs">
                El documento está emitido y su contenido es inmutable. Lo que falta es archivarlo en
                SharePoint, y hasta que se archive no puede adjuntarse a un aviso.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
