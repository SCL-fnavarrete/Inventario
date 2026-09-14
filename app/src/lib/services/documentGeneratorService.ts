import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { AnexoEntregaTemplate } from '@/lib/templates/AnexoEntregaTemplate';
import { ComprobanteEntregaTemplate } from '@/lib/templates/ComprobanteEntregaTemplate';
import { ComprobanteCambioTemplate } from '@/lib/templates/ComprobanteCambioTemplate';
import { ActaDevolucionTemplate } from '@/lib/templates/ActaDevolucionTemplate';
import { prisma } from '@/lib/prisma';

// Helper to cast React.createElement result for @react-pdf/renderer
function renderPdf(element: React.ReactElement) {
  return renderToBuffer(element as React.ReactElement<DocumentProps>);
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-CL');
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Fecha larga en español ("Miércoles, 10 de septiembre de 2026"), para la
// redaccion de la intro del comprobante -- mismo formato que se usaba a
// mano en la herramienta externa que este documento reemplaza.
function formatDateLarga(date: Date | string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Descripcion de equipo en una sola linea, igual al criterio que ya se usa
// en el detalle de Guias de Despacho -- especificaciones tecnicas para
// notebooks, datos de linea para celulares. (14-sep-2026: se quito
// "operador" de la firma -- ese campo del Activo ya no existe, SPEC 2.20.
// Este archivo referenciaba el campo eliminado y no compilaba; bug
// preexistente detectado ahora porque el CI corre `tsc`.)
function descripcionAsset(asset: {
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  numeroTelefono: string | null;
}): string {
  const partes: string[] = [];
  if (asset.procesador) partes.push(`Proc: ${asset.procesador}`);
  if (asset.ram) partes.push(`RAM: ${asset.ram}`);
  if (asset.discoDuro) partes.push(`Disco: ${asset.discoDuro}`);
  if (asset.sistemaOperativo) partes.push(`SO: ${asset.sistemaOperativo}`);
  if (asset.numeroTelefono) partes.push(`Tel: ${asset.numeroTelefono}`);
  return partes.join(' | ');
}

// Nombre y correo de quien gestiona/recibe la operacion, para dejar registro
// verificable en la firma del documento (no solo el nombre, que puede repetirse
// entre personas).
function nombreConCorreo(user: { nombre: string; email: string }): string {
  return `${user.nombre} (${user.email})`;
}

export async function generateAnexoEntrega(solicitudId: string): Promise<Buffer> {
  const solicitud = await prisma.workflowRequest.findUniqueOrThrow({
    where: { id: solicitudId },
    include: {
      employee: {
        include: {
          assignments: {
            where: { activo: true },
            include: { asset: { include: { categoria: true } } },
          },
        },
      },
      solicitante: true,
      responsableActual: true,
    },
  });

  const assets = solicitud.employee.assignments.map((a) => ({
    tipo: a.asset.categoria.nombre,
    marca: a.asset.marca,
    modelo: a.asset.modelo,
    numeroSerie: a.asset.numeroSerie,
    procesador: a.asset.procesador,
    discoDuro: a.asset.discoDuro,
    ram: a.asset.ram,
    estado: a.asset.condicion,
    imei: a.asset.imei,
    numeroTelefono: a.asset.numeroTelefono,
  }));

  const element = React.createElement(AnexoEntregaTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    cargo: solicitud.cargoSolicitado || solicitud.employee.cargo || '—',
    fechaContrato: formatDate(solicitud.employee.fechaIngreso),
    fechaEntrega: formatDate(new Date()),
    assets,
    gestionadoPor: nombreConCorreo(solicitud.responsableActual || solicitud.solicitante),
  });

  return renderPdf(element);
}

export async function generateComprobanteEntrega(solicitudId: string): Promise<Buffer> {
  const solicitud = await prisma.workflowRequest.findUniqueOrThrow({
    where: { id: solicitudId },
    include: {
      employee: {
        include: {
          assignments: {
            where: { activo: true },
            include: { asset: { include: { categoria: true } } },
          },
        },
      },
      solicitante: true,
      responsableActual: true,
    },
  });

  const assets = solicitud.employee.assignments.map((a) => ({
    equipo: a.asset.categoria.nombre,
    marca: a.asset.marca,
    descripcion: descripcionAsset(a.asset),
    entregado: 'OK',
  }));

  // Coordinacion "por OT" (medioEntrega === 'chilexpress'): se agrega la
  // clausula de OT a la intro, igual que la variante "entrega_ot" de la
  // herramienta externa -- pero leyendo el dato real de la solicitud en
  // vez de pedirlo de nuevo.
  const otNumero =
    solicitud.medioEntrega === 'chilexpress' ? solicitud.otChilexpressEntrega : null;

  const element = React.createElement(ComprobanteEntregaTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fecha: formatDateLarga(new Date()),
    otNumero,
    assets,
    observacion: solicitud.observaciones || 'n/a',
    // Comprobante de entrega: fiel a la plantilla externa, que solo firma
    // con nombre y empresa (sin correo) -- a diferencia de los otros
    // documentos, que si usan nombreConCorreo() para trazabilidad.
    gestionadoPor: (solicitud.responsableActual || solicitud.solicitante).nombre,
  });

  return renderPdf(element);
}

export async function generateComprobanteCambio(solicitudId: string): Promise<Buffer> {
  const solicitud = await prisma.workflowRequest.findUniqueOrThrow({
    where: { id: solicitudId },
    include: {
      employee: true,
      solicitante: true,
      responsableActual: true,
      transitions: {
        where: { estadoNuevo: 'cambio_ejecutado' },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // Get the assignment IDs to find old and new assets
  const assignments = await prisma.assignment.findMany({
    where: { id: { in: solicitud.assignmentIds } },
    include: { asset: { include: { categoria: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const newAssignment = assignments[0];
  const datosAccion = (solicitud.transitions[0]?.datosAccion as Record<string, unknown>) || {};

  // Try to find the old asset from transition data
  let oldAsset = null;
  if (datosAccion.oldAssignmentId) {
    const oldAssignment = await prisma.assignment.findUnique({
      where: { id: datosAccion.oldAssignmentId as string },
      include: { asset: { include: { categoria: true } } },
    });
    if (oldAssignment) oldAsset = oldAssignment.asset;
  }

  const toAssetInfo = (asset: typeof newAssignment.asset) => ({
    tipo: asset.categoria.nombre,
    marca: asset.marca,
    modelo: asset.modelo,
    numeroSerie: asset.numeroSerie,
    estado: asset.condicion,
  });

  const element = React.createElement(ComprobanteCambioTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fecha: formatDate(new Date()),
    motivoCambio: solicitud.motivoCambio || '—',
    equipoNuevo: newAssignment ? toAssetInfo(newAssignment.asset) : { tipo: '—', marca: '—', modelo: '—', numeroSerie: null, estado: '—' },
    equipoAnterior: oldAsset ? toAssetInfo(oldAsset) : { tipo: '—', marca: '—', modelo: '—', numeroSerie: null, estado: '—' },
    gestionadoPor: nombreConCorreo(solicitud.responsableActual || solicitud.solicitante),
  });

  return renderPdf(element);
}

export async function generateActaDevolucion(solicitudId: string): Promise<Buffer> {
  const solicitud = await prisma.workflowRequest.findUniqueOrThrow({
    where: { id: solicitudId },
    include: {
      employee: {
        include: {
          assignments: {
            include: { asset: { include: { categoria: true } } },
            orderBy: { fechaEntrega: 'desc' },
          },
        },
      },
      solicitante: true,
      responsableActual: true,
    },
  });

  // Get recently returned assignments
  const returnedAssignments = solicitud.employee.assignments.filter(
    (a) => !a.activo && a.fechaDevolucion
  );

  const assets = returnedAssignments.map((a) => ({
    tipo: a.asset.categoria.nombre,
    marca: a.asset.marca,
    modelo: a.asset.modelo,
    numeroSerie: a.asset.numeroSerie,
    estadoDevolucion: a.estadoDevolucion || 'ok',
  }));

  const element = React.createElement(ActaDevolucionTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fechaInicio: formatDate(solicitud.employee.fechaIngreso),
    fechaTermino: formatDate(solicitud.fechaDesvinculacion),
    fechaDevolucion: formatDate(new Date()),
    assets,
    observaciones: solicitud.observaciones,
    recibidoPor: nombreConCorreo(solicitud.responsableActual || solicitud.solicitante),
  });

  return renderPdf(element);
}
