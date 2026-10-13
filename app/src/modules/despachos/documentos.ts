import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import type { EstadoItemGuia } from '@prisma/client';
import { GuiaDespachoTemplate } from '@/modules/despachos/plantillas/GuiaDespachoTemplate';
import { buscarGuia } from '@/modules/despachos/servicio';
import { filaEquipo } from '@/modules/solicitudes/documentos';

/**
 * PDF de la guia de despacho (GET /api/guias-despacho/[id]/documento). Puerta
 * propia, como la de Solicitudes: los PDF pesan y no deben entrar en las pantallas.
 * Se puede bajar en cualquier estado; una guia anulada lleva la marca ANULADA.
 */

// Como en las actas: el instante real se muestra en hora de Chile.
const ZONA = 'America/Santiago';
const fecha = (d: Date) => d.toLocaleDateString('es-CL', { timeZone: ZONA });

const ESTADO_EQUIPO: Record<EstadoItemGuia, string> = {
  en_transito: 'En tránsito',
  recibido: 'Recibido',
  perdido: 'Perdido',
};

export async function generateGuiaDespacho(id: string): Promise<{ pdf: Buffer; nombreArchivo: string }> {
  const guia = await buscarGuia(id);
  const element = React.createElement(GuiaDespachoTemplate, {
    numero: guia.numero,
    fecha: fecha(guia.fechaDespacho),
    sedeOrigen: guia.sede?.nombre ?? 'la sede de origen',
    sedeDestino: guia.sedeDestino.nombre,
    otChilexpress: guia.otChilexpress,
    emisor: guia.despachadoPor,
    receptorNombre: guia.receptorNombre,
    receptorRut: guia.receptorRut,
    fechaEstimadaLlegada: guia.fechaEstimadaLlegada ? fecha(guia.fechaEstimadaLlegada) : null,
    equipos: guia.items.map((i) => filaEquipo(i.asset, ESTADO_EQUIPO[i.estado], null)),
    kit: guia.kitItems.map((k) => ({ articulo: k.item.nombre, categoria: k.item.categoria, cantidad: k.cantidad })),
    observaciones: guia.observaciones ?? '',
    anulada:
      guia.estado === 'anulada' && guia.fechaAnulacion
        ? { fecha: fecha(guia.fechaAnulacion), motivo: guia.motivoAnulacion ?? '' }
        : null,
  });
  const pdf = await renderToBuffer(element as React.ReactElement<DocumentProps>);
  return { pdf, nombreArchivo: `Guia_Despacho_${guia.numero}.pdf` };
}
