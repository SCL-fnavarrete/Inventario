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
    operador: a.asset.operador,
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
    tipo: a.asset.categoria.nombre,
    marca: a.asset.marca,
    modelo: a.asset.modelo,
    numeroSerie: a.asset.numeroSerie,
    estado: a.asset.condicion,
    imei: a.asset.imei,
    numeroTelefono: a.asset.numeroTelefono,
    operador: a.asset.operador,
  }));

  const element = React.createElement(ComprobanteEntregaTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fechaEntrega: formatDate(new Date()),
    assets,
    gestionadoPor: nombreConCorreo(solicitud.responsableActual || solicitud.solicitante),
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
