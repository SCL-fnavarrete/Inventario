import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { AnexoEntregaTemplate } from '@/lib/templates/AnexoEntregaTemplate';
import { ComprobanteEntregaTemplate } from '@/lib/templates/ComprobanteEntregaTemplate';
import { ComprobanteCambioTemplate } from '@/lib/templates/ComprobanteCambioTemplate';
import { ActaDevolucionTemplate } from '@/lib/templates/ActaDevolucionTemplate';
import type { EvidenciaDocumento } from '@/lib/templates/evidencia';
import type {
  ActaDevolucionSnapshot,
  ActivoSnapshot,
  AnexoEntregaSnapshot,
  ComprobanteCambioSnapshot,
  ComprobanteEntregaSnapshot,
  DocumentoSnapshot,
} from '@/lib/documents/snapshot';

/**
 * Renderiza un documento emitido a partir de su snapshot, y de nada mas.
 *
 * Antes cada generador consultaba Prisma en el momento de la descarga y
 * estampaba `new Date()` en el pie: dos descargas del mismo documento daban
 * PDFs distintos y renombrar una categoria cambiaba un acta ya firmada. Ahora
 * el modulo no importa Prisma ni lee el reloj, que es lo que permite hashear
 * los bytes archivados y verificarlos despues (SPEC 2.1 sexies).
 *
 * El determinismo byte a byte depende de `creationDate`: `@react-pdf/renderer`
 * escribe `/CreationDate` y deriva de el el `/ID` del trailer, asi que sin
 * fijarlo el mismo snapshot produce hashes distintos.
 */

function renderPdf(element: React.ReactElement) {
  return renderToBuffer(element as React.ReactElement<DocumentProps>);
}

/**
 * Formato dd-mm-aaaa en UTC, calculado a mano.
 *
 * `toLocaleDateString('es-CL')` depende del ICU del runtime y de la zona
 * horaria del proceso: el mismo snapshot renderizado en Vercel y en un equipo
 * local daria bytes distintos, y el hash archivado dejaria de verificar.
 */
function formatearFecha(iso: string | null): string {
  if (!iso) return '—';
  const fecha = new Date(iso);
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}-${mes}-${fecha.getUTCFullYear()}`;
}

function evidenciaDe(snapshot: DocumentoSnapshot): EvidenciaDocumento {
  return {
    numero: snapshot.numero,
    version: snapshot.version,
    emitidoEnTexto: formatearFecha(snapshot.emitidoEn),
    creationDate: new Date(snapshot.emitidoEn),
    firmaPng: snapshot.firma.imagenPng,
    firmadaEnTexto: snapshot.firma.firmadaEn ? formatearFecha(snapshot.firma.firmadaEn) : null,
    aceptaPoliticaUso: snapshot.aceptaPoliticaUso,
  };
}

function activoDetallado(activo: ActivoSnapshot) {
  return {
    tipo: activo.categoriaNombre,
    marca: activo.marca,
    modelo: activo.modelo,
    numeroSerie: activo.numeroSerie,
    procesador: activo.procesador,
    discoDuro: activo.discoDuro,
    ram: activo.ram,
    estado: activo.condicion,
    imei: activo.imei,
    numeroTelefono: activo.numeroTelefono,
    operador: activo.operador,
  };
}

function activoResumido(activo: ActivoSnapshot) {
  return {
    tipo: activo.categoriaNombre,
    marca: activo.marca,
    modelo: activo.modelo,
    numeroSerie: activo.numeroSerie,
    estado: activo.condicion,
    imei: activo.imei,
    numeroTelefono: activo.numeroTelefono,
    operador: activo.operador,
  };
}

const EQUIPO_AUSENTE = {
  tipo: '—',
  marca: '—',
  modelo: '—',
  numeroSerie: null,
  estado: '—',
};

export function generateAnexoEntrega(snapshot: AnexoEntregaSnapshot): Promise<Buffer> {
  return renderPdf(
    React.createElement(AnexoEntregaTemplate, {
      evidencia: evidenciaDe(snapshot),
      empleadoNombre: snapshot.empleado.nombreCompleto,
      empleadoRut: snapshot.empleado.rut || '—',
      cargo: snapshot.empleado.cargo || '—',
      fechaContrato: formatearFecha(snapshot.empleado.fechaIngreso),
      fechaEntrega: formatearFecha(snapshot.fechaEntrega),
      assets: snapshot.activos.map(activoDetallado),
      gestionadoPor: snapshot.gestionadoPor,
    })
  );
}

export function generateComprobanteEntrega(snapshot: ComprobanteEntregaSnapshot): Promise<Buffer> {
  return renderPdf(
    React.createElement(ComprobanteEntregaTemplate, {
      evidencia: evidenciaDe(snapshot),
      empleadoNombre: snapshot.empleado.nombreCompleto,
      empleadoRut: snapshot.empleado.rut || '—',
      fechaEntrega: formatearFecha(snapshot.fechaEntrega),
      assets: snapshot.activos.map(activoResumido),
      gestionadoPor: snapshot.gestionadoPor,
    })
  );
}

export function generateComprobanteCambio(snapshot: ComprobanteCambioSnapshot): Promise<Buffer> {
  return renderPdf(
    React.createElement(ComprobanteCambioTemplate, {
      evidencia: evidenciaDe(snapshot),
      empleadoNombre: snapshot.empleado.nombreCompleto,
      empleadoRut: snapshot.empleado.rut || '—',
      fecha: formatearFecha(snapshot.fecha),
      motivoCambio: snapshot.motivoCambio,
      equipoNuevo: snapshot.equipoNuevo
        ? {
            tipo: snapshot.equipoNuevo.categoriaNombre,
            marca: snapshot.equipoNuevo.marca,
            modelo: snapshot.equipoNuevo.modelo,
            numeroSerie: snapshot.equipoNuevo.numeroSerie,
            estado: snapshot.equipoNuevo.condicion,
          }
        : EQUIPO_AUSENTE,
      equipoAnterior: snapshot.equipoAnterior
        ? {
            tipo: snapshot.equipoAnterior.categoriaNombre,
            marca: snapshot.equipoAnterior.marca,
            modelo: snapshot.equipoAnterior.modelo,
            numeroSerie: snapshot.equipoAnterior.numeroSerie,
            estado: snapshot.equipoAnterior.condicion,
          }
        : EQUIPO_AUSENTE,
      gestionadoPor: snapshot.gestionadoPor,
    })
  );
}

export function generateActaDevolucion(snapshot: ActaDevolucionSnapshot): Promise<Buffer> {
  return renderPdf(
    React.createElement(ActaDevolucionTemplate, {
      evidencia: evidenciaDe(snapshot),
      empleadoNombre: snapshot.empleado.nombreCompleto,
      empleadoRut: snapshot.empleado.rut || '—',
      fechaInicio: formatearFecha(snapshot.fechaInicio),
      fechaTermino: formatearFecha(snapshot.fechaTermino),
      fechaDevolucion: formatearFecha(snapshot.fechaDevolucion),
      assets: snapshot.activos.map((activo) => ({
        tipo: activo.categoriaNombre,
        marca: activo.marca,
        modelo: activo.modelo,
        numeroSerie: activo.numeroSerie,
        estadoDevolucion: activo.estadoDevolucion,
      })),
      observaciones: snapshot.observaciones,
      recibidoPor: snapshot.recibidoPor,
    })
  );
}

/** Punto de entrada unico: el tipo del snapshot elige la plantilla. */
export function generarPdfDesdeSnapshot(snapshot: DocumentoSnapshot): Promise<Buffer> {
  switch (snapshot.tipo) {
    case 'anexo_entrega':
      return generateAnexoEntrega(snapshot);
    case 'comprobante_entrega':
      return generateComprobanteEntrega(snapshot);
    case 'comprobante_cambio':
      return generateComprobanteCambio(snapshot);
    case 'acta_devolucion':
      return generateActaDevolucion(snapshot);
    default: {
      const tipo = (snapshot as { tipo: string }).tipo;
      return Promise.reject(new Error(`Tipo de documento no soportado: ${tipo}`));
    }
  }
}
