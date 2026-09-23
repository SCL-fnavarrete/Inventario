import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { AnexoEntregaTemplate } from '@/lib/templates/AnexoEntregaTemplate';
import { ComprobanteEntregaTemplate } from '@/lib/templates/ComprobanteEntregaTemplate';
import { ComprobanteCambioTemplate } from '@/lib/templates/ComprobanteCambioTemplate';
import { ActaDevolucionTemplate } from '@/lib/templates/ActaDevolucionTemplate';
import { prisma } from '@/lib/prisma';
import { formatearFecha } from "@/lib/utils/fechas";
import {
  etiquetaCondicionCargador,
  type ContextoCargador,
} from "@/lib/constants/condicionCargador";

// Helper to cast React.createElement result for @react-pdf/renderer
function renderPdf(element: React.ReactElement) {
  return renderToBuffer(element as React.ReactElement<DocumentProps>);
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Fecha larga en español para la redaccion de la intro del comprobante.
function formatDateLarga(date: Date | string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

// Descripcion de equipo en una sola linea: especificaciones tecnicas para
// notebooks, datos de linea para celulares.
function descripcionAsset(
  asset: {
    procesador: string | null;
    ram: string | null;
    discoDuro: string | null;
    sistemaOperativo: string | null;
    numeroTelefono: string | null;
  },
  // Condicion del cargador: se agrega como un dato mas de la descripcion,
  // no como columna propia.
  cargador?: string | null
): string {
  const partes: string[] = [];
  if (asset.procesador) partes.push(`Proc: ${asset.procesador}`);
  if (asset.ram) partes.push(`RAM: ${asset.ram}`);
  if (asset.discoDuro) partes.push(`Disco: ${asset.discoDuro}`);
  if (asset.sistemaOperativo) partes.push(`SO: ${asset.sistemaOperativo}`);
  if (asset.numeroTelefono) partes.push(`Tel: ${asset.numeroTelefono}`);
  if (cargador) partes.push(`Cargador: ${cargador}`);
  return partes.join(' | ');
}

// Descripcion para equipos que se devuelven o cambian: a diferencia de
// descripcionAsset, aca importa identificar el equipo fisico concreto
// (modelo y N° de serie), no sus specs tecnicas.
function descripcionEquipoDevuelto(
  asset: { modelo: string; numeroSerie: string | null },
  cargador?: string | null
): string {
  const partes: string[] = [`Modelo: ${asset.modelo}`];
  partes.push(`N° Serie: ${asset.numeroSerie || 's/serie'}`);
  if (cargador) partes.push(`Cargador: ${cargador}`);
  return partes.join(' | ');
}

// Texto del cargador para el acta: etiqueta de la condicion y, si hay, la
// observacion entre parentesis ("Con daños (cable pelado)"). Null si el
// equipo no tiene cargador o nunca se registro.
function textoCargador(
  asignacion: { observacionesCargador: string | null },
  condicion: string | null | undefined,
  contexto: ContextoCargador
): string | null {
  const etiqueta = etiquetaCondicionCargador(condicion, contexto);
  if (!etiqueta) return null;
  const obs = asignacion.observacionesCargador?.trim();
  return obs ? `${etiqueta} (${obs})` : etiqueta;
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
    fechaContrato: formatearFecha(solicitud.employee.fechaIngreso, {}, '—'),
    fechaEntrega: formatearFecha(new Date(), {}, '—'),
    assets,
    // Solo nombre, sin correo -- mismo criterio que el resto de los
    // documentos.
    gestionadoPor: (solicitud.responsableActual || solicitud.solicitante).nombre,
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
    descripcion: descripcionAsset(a.asset, textoCargador(a, a.condicionCargadorEntrega, 'entrega')),
    entregado: 'OK',
  }));

  // Coordinacion "por OT": se agrega la clausula de OT a la intro cuando
  // el medio de entrega es chilexpress.
  const otNumero =
    solicitud.medioEntrega === 'chilexpress' ? solicitud.otChilexpressEntrega : null;

  const element = React.createElement(ComprobanteEntregaTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fecha: formatDateLarga(new Date()),
    otNumero,
    assets,
    observacion: solicitud.observaciones || 'n/a',
    // Firma solo con nombre y empresa, sin correo.
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
    },
  });

  // Se usa WorkflowRequest.assignmentIds en vez del historial de
  // transiciones, porque no todo ticket pasa por una transicion explicita.
  // En ambos caminos de ejecucion se guarda [oldAssignmentId,
  // newAssignmentId], en ese orden.
  const [oldAssignmentId, newAssignmentId] = solicitud.assignmentIds;

  const assignments = await prisma.assignment.findMany({
    where: { id: { in: [oldAssignmentId, newAssignmentId].filter(Boolean) } },
    include: { asset: { include: { categoria: true } } },
  });

  const newAssignment = assignments.find((a) => a.id === newAssignmentId) || null;
  const oldAssignment = assignments.find((a) => a.id === oldAssignmentId) || null;

  const toAssetInfo = (
    asset: { categoria: { nombre: string }; marca: string; modelo: string; numeroSerie: string | null },
    estado: string,
    cargador: string | null
  ) => ({
    equipo: asset.categoria.nombre,
    marca: asset.marca,
    descripcion: descripcionEquipoDevuelto(asset, cargador),
    estado,
  });

  const element = React.createElement(ComprobanteCambioTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fecha: formatearFecha(new Date(), {}, '—'),
    motivoCambio: solicitud.motivoCambio || '—',
    equipoNuevo: newAssignment
      ? toAssetInfo(
          newAssignment.asset,
          'Entregado OK',
          textoCargador(newAssignment, newAssignment.condicionCargadorEntrega, 'entrega')
        )
      : { equipo: '—', marca: '—', descripcion: '—', estado: '—' },
    equipoAnterior: oldAssignment
      ? toAssetInfo(
          oldAssignment.asset,
          'Devolución OK',
          textoCargador(oldAssignment, oldAssignment.condicionCargadorDevolucion, 'devolucion')
        )
      : { equipo: '—', marca: '—', descripcion: '—', estado: '—' },
    // Solo el nombre, sin correo entre parentesis -- mismo criterio que
    // el Comprobante de Entrega.
    gestionadoPor: (solicitud.responsableActual || solicitud.solicitante).nombre,
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
    equipo: a.asset.categoria.nombre,
    marca: a.asset.marca,
    descripcion: descripcionEquipoDevuelto(a.asset, textoCargador(a, a.condicionCargadorDevolucion, 'devolucion')),
    estado:
      a.estadoDevolucion === 'ok'
        ? 'OK'
        : a.estadoDevolucion === 'danado'
          ? 'No OK'
          : a.estadoDevolucion || 'OK',
  }));

  const element = React.createElement(ActaDevolucionTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fechaTermino: formatearFecha(solicitud.fechaDesvinculacion, {}, '—'),
    fechaDevolucion: formatearFecha(new Date(), {}, '—'),
    assets,
    observacion: solicitud.observaciones || 'n/a',
    // Solo nombre, sin correo -- mismo criterio que el resto de los
    // documentos.
    recibidoPor: (solicitud.responsableActual || solicitud.solicitante).nombre,
  });

  return renderPdf(element);
}
