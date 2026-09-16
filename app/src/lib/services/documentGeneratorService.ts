import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { AnexoEntregaTemplate } from '@/lib/templates/AnexoEntregaTemplate';
import { ComprobanteEntregaTemplate } from '@/lib/templates/ComprobanteEntregaTemplate';
import { ComprobanteCambioTemplate } from '@/lib/templates/ComprobanteCambioTemplate';
import { ActaDevolucionTemplate } from '@/lib/templates/ActaDevolucionTemplate';
import { prisma } from '@/lib/prisma';
import { formatearFecha } from "@/lib/utils/fechas";

// Helper to cast React.createElement result for @react-pdf/renderer
function renderPdf(element: React.ReactElement) {
  return renderToBuffer(element as React.ReactElement<DocumentProps>);
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  return formatearFecha(date);
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
function descripcionAsset(
  asset: {
    procesador: string | null;
    ram: string | null;
    discoDuro: string | null;
    sistemaOperativo: string | null;
    numeroTelefono: string | null;
  },
  // Condicion del cargador (16-sep-2026, SPEC 2.48): se agrega como un dato
  // mas de la descripcion en vez de una columna nueva -- este documento
  // tiene que seguir siendo fiel al formato de la herramienta externa (ver
  // comentario en ComprobanteEntregaTemplate), que no tiene columna propia
  // para el cargador.
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

// Descripcion para equipos que se devuelven o cambian (16-sep-2026, SPEC
// 2.49) -- a diferencia de descripcionAsset (que muestra specs tecnicas,
// pensadas para una entrega), aca importa mas identificar el equipo fisico
// concreto: modelo y N° de serie, ademas del cargador si aplica.
function descripcionEquipoDevuelto(
  asset: { modelo: string; numeroSerie: string | null },
  cargador?: string | null
): string {
  const partes: string[] = [`Modelo: ${asset.modelo}`];
  partes.push(`N° Serie: ${asset.numeroSerie || 's/serie'}`);
  if (cargador) partes.push(`Cargador: ${cargador}`);
  return partes.join(' | ');
}

// Etiqueta legible de la condicion del cargador (16-sep-2026, SPEC 2.48) --
// null si el equipo no es un notebook con cargador, o si nunca se
// registro (queda "pendiente" en el enum por defecto, que tampoco se
// imprime -- no aporta nada al acta).
function labelCargador(condicion: string | null | undefined): string | null {
  if (condicion === 'ok') return 'Ok';
  if (condicion === 'danado') return 'Dañado';
  if (condicion === 'no_aplica') return 'No aplica';
  return null;
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
    // 16-sep-2026 (SPEC 2.50): solo nombre, sin correo -- mismo criterio
    // que el resto de los documentos.
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
    descripcion: descripcionAsset(a.asset, labelCargador(a.condicionCargadorEntrega)),
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
    // Firma solo con nombre y empresa, sin correo (SPEC 2.50).
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

  // 16-sep-2026 (SPEC 2.50): antes se buscaba el equipo anterior en
  // datosAccion.oldAssignmentId de la transicion "cambio_ejecutado" -- eso
  // solo existe para tickets ejecutados manualmente desde el detalle
  // (incidencia_detectada -> cambio_ejecutado). Desde SPEC 2.45, un ticket
  // creado con el equipo ya elegido se ejecuta y cierra de inmediato, sin
  // pasar por esa transicion, asi que nunca habia datosAccion y "Equipo
  // devuelto" salia vacio. En vez de depender del historial de
  // transiciones, se usa directamente WorkflowRequest.assignmentIds: en
  // ambos caminos de ejecucion (creacion directa y transicion manual) se
  // guarda [oldAssignmentId, newAssignmentId], en ese orden.
  const [oldAssignmentId, newAssignmentId] = solicitud.assignmentIds;

  const assignments = await prisma.assignment.findMany({
    where: { id: { in: [oldAssignmentId, newAssignmentId].filter(Boolean) } },
    include: { asset: { include: { categoria: true } } },
  });

  const newAssignment = assignments.find((a) => a.id === newAssignmentId) || null;
  const oldAssignment = assignments.find((a) => a.id === oldAssignmentId) || null;
  const oldAsset = oldAssignment?.asset || null;
  const oldCondicionCargadorDevolucion = oldAssignment?.condicionCargadorDevolucion || null;

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
    fecha: formatDate(new Date()),
    motivoCambio: solicitud.motivoCambio || '—',
    equipoNuevo: newAssignment
      ? toAssetInfo(newAssignment.asset, 'Entregado OK', labelCargador(newAssignment.condicionCargadorEntrega))
      : { equipo: '—', marca: '—', descripcion: '—', estado: '—' },
    equipoAnterior: oldAsset
      ? toAssetInfo(oldAsset, 'Devolución OK', labelCargador(oldCondicionCargadorDevolucion))
      : { equipo: '—', marca: '—', descripcion: '—', estado: '—' },
    // 16-sep-2026 (SPEC 2.50): solo el nombre, sin correo entre parentesis
    // -- mismo criterio que ya usaba el Comprobante de Entrega. Antes este
    // documento (y el Acta de Devolucion) usaban nombreConCorreo().
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
    descripcion: descripcionEquipoDevuelto(a.asset, labelCargador(a.condicionCargadorDevolucion)),
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
    fechaTermino: formatDate(solicitud.fechaDesvinculacion),
    fechaDevolucion: formatDate(new Date()),
    assets,
    observacion: solicitud.observaciones || 'n/a',
    // 16-sep-2026 (SPEC 2.50): solo nombre, sin correo -- mismo criterio
    // que el resto de los documentos.
    recibidoPor: (solicitud.responsableActual || solicitud.solicitante).nombre,
  });

  return renderPdf(element);
}
