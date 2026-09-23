import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { AnexoEntregaTemplate } from '@/lib/templates/AnexoEntregaTemplate';
import { ComprobanteEntregaTemplate } from '@/lib/templates/ComprobanteEntregaTemplate';
import { ComprobanteCambioTemplate } from '@/lib/templates/ComprobanteCambioTemplate';
import { ActaDevolucionTemplate } from '@/lib/templates/ActaDevolucionTemplate';
import type { FilaEquipoActa } from '@/lib/templates/TablaEquipoActa';
import { prisma } from '@/lib/prisma';
import { especificacionesActivo, type ActivoParaSpecs } from '@/lib/utils/assetSpecs';
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

// Fila de la tabla de equipos de un acta (TablaEquipoActa). El N° de serie y
// las especificaciones van en columnas propias; la descripcion queda para el
// modelo y la condicion del cargador, sin repetir lo anterior.
function filaEquipo(
  // pulgadas llega como Decimal de Prisma: se pasa a texto para assetSpecs.
  asset: Omit<ActivoParaSpecs, 'pulgadas'> & {
    pulgadas: { toString(): string } | null;
    categoria: { nombre: string };
    marca: string;
    modelo: string;
    numeroSerie: string | null;
  },
  estado: string,
  cargador: FilaEquipoActa['cargador']
): FilaEquipoActa {
  return {
    equipo: asset.categoria.nombre,
    marca: asset.marca,
    numeroSerie: asset.numeroSerie,
    descripcion: asset.modelo,
    especificaciones: especificacionesActivo({ ...asset, pulgadas: asset.pulgadas?.toString() ?? null })
      .map(({ etiqueta, valor }) => `${etiqueta}: ${valor}`)
      .join('\n'),
    estado,
    cargador,
  };
}

// Fila vacia para un equipo que no se encontro (ticket sin asignacion).
const FILA_VACIA: FilaEquipoActa = {
  equipo: '—',
  marca: '—',
  numeroSerie: null,
  descripcion: '—',
  especificaciones: '',
  estado: '—',
  cargador: null,
};

// Cargador para la tabla aparte del acta: etiqueta de la condicion y la
// observacion. Null si el equipo no tiene cargador o nunca se registro.
function textoCargador(
  asignacion: { observacionesCargador: string | null },
  condicion: string | null | undefined,
  contexto: ContextoCargador
): FilaEquipoActa['cargador'] {
  const etiqueta = etiquetaCondicionCargador(condicion, contexto);
  if (!etiqueta) return null;
  return { condicion: etiqueta, observacion: asignacion.observacionesCargador?.trim() || null };
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

  const assets = solicitud.employee.assignments.map((a) =>
    filaEquipo(a.asset, 'OK', textoCargador(a, a.condicionCargadorEntrega, 'entrega'))
  );

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

  // Coordinacion "por OT": clausula de OT en la intro, igual que la entrega.
  const otNumero = solicitud.medioCambio === 'chilexpress' ? solicitud.otCambioChilexpress : null;

  const element = React.createElement(ComprobanteCambioTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fecha: formatearFecha(new Date(), {}, '—'),
    motivoCambio: solicitud.motivoCambio || '—',
    otNumero,
    equipoNuevo: newAssignment
      ? filaEquipo(
          newAssignment.asset,
          'Entregado OK',
          textoCargador(newAssignment, newAssignment.condicionCargadorEntrega, 'entrega')
        )
      : FILA_VACIA,
    equipoAnterior: oldAssignment
      ? filaEquipo(
          oldAssignment.asset,
          'Devolución OK',
          textoCargador(oldAssignment, oldAssignment.condicionCargadorDevolucion, 'devolucion')
        )
      : FILA_VACIA,
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

  // Solo lo calificado en ESTE ticket (assignmentIds): antes se listaba toda
  // devolucion historica del empleado, incluidos equipos devueltos en un
  // cambio de equipo anterior. Se filtra por estadoDevolucion y no por
  // fechaDevolucion, porque "no_devuelto" deja la asignacion activa y sin
  // fecha, pero igual va en el acta. Tickets antiguos sin assignmentIds
  // conservan el criterio anterior.
  const returnedAssignments =
    solicitud.assignmentIds.length > 0
      ? solicitud.employee.assignments.filter(
          (a) => solicitud.assignmentIds.includes(a.id) && a.estadoDevolucion
        )
      : solicitud.employee.assignments.filter((a) => !a.activo && a.fechaDevolucion);

  const assets = returnedAssignments.map((a) =>
    filaEquipo(
      a.asset,
      a.estadoDevolucion === 'ok'
        ? 'OK'
        : a.estadoDevolucion === 'danado'
          ? 'No OK'
          : a.estadoDevolucion === 'no_devuelto'
            ? 'No devuelto'
            : a.estadoDevolucion || 'OK',
      textoCargador(a, a.condicionCargadorDevolucion, 'devolucion')
    )
  );

  // Coordinacion "por OT": clausula de OT en la intro, igual que la entrega.
  const otNumero = solicitud.medioDevolucion === 'chilexpress' ? solicitud.otChilexpress : null;

  const element = React.createElement(ActaDevolucionTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fechaTermino: formatearFecha(solicitud.fechaDesvinculacion, {}, '—'),
    fechaDevolucion: formatearFecha(new Date(), {}, '—'),
    otNumero,
    assets,
    observacion: solicitud.observaciones || 'n/a',
    // Solo nombre, sin correo -- mismo criterio que el resto de los
    // documentos.
    recibidoPor: (solicitud.responsableActual || solicitud.solicitante).nombre,
  });

  return renderPdf(element);
}
