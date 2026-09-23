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

// Los PDF se generan en el servidor (UTC en Vercel) y la fecha del documento
// es un instante real (la entrega/devolucion coordinada, o la creacion del
// ticket): se muestra en hora de Chile, donde se firma. Antes se usaba la
// fecha del dia en que se descargaba, que cambiaba con cada descarga.
const ZONA_DOCUMENTOS = 'America/Santiago';

/** "23-09-2026", en hora de Chile. */
function fechaDocumento(fecha: Date): string {
  return fecha.toLocaleDateString('es-CL', { timeZone: ZONA_DOCUMENTOS });
}

/** "Miércoles, 23 de septiembre de 2026", para la intro del comprobante. */
function fechaDocumentoLarga(fecha: Date): string {
  const texto = fecha.toLocaleDateString('es-CL', {
    timeZone: ZONA_DOCUMENTOS,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Asignaciones de ESTE ticket (assignmentIds), en su orden. Los tickets
 * antiguos sin assignmentIds devuelven null y el llamador usa su criterio
 * anterior.
 */
async function asignacionesDelTicket(assignmentIds: string[]) {
  if (assignmentIds.length === 0) return null;
  const filas = await prisma.assignment.findMany({
    where: { id: { in: assignmentIds } },
    include: { asset: { include: { categoria: true } } },
  });
  const porId = new Map(filas.map((a) => [a.id, a]));
  return assignmentIds.flatMap((id) => porId.get(id) ?? []);
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

  // Solo los equipos entregados en este ticket: el empleado pudo cambiar de
  // equipo o desvincularse despues.
  const asignaciones =
    (await asignacionesDelTicket(solicitud.assignmentIds)) ?? solicitud.employee.assignments;
  const assets = asignaciones.map((a) => ({
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
    fechaEntrega: fechaDocumento(solicitud.fechaEntregaCoordinada ?? solicitud.createdAt),
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

  // Solo los equipos entregados en este ticket (ver generateAnexoEntrega).
  const asignaciones =
    (await asignacionesDelTicket(solicitud.assignmentIds)) ?? solicitud.employee.assignments;
  const assets = asignaciones.map((a) =>
    filaEquipo(a.asset, 'OK', textoCargador(a, a.condicionCargadorEntrega, 'entrega'))
  );

  // Coordinacion "por OT": se agrega la clausula de OT a la intro cuando
  // el medio de entrega es chilexpress.
  const otNumero =
    solicitud.medioEntrega === 'chilexpress' ? solicitud.otChilexpressEntrega : null;

  const element = React.createElement(ComprobanteEntregaTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fecha: fechaDocumentoLarga(solicitud.fechaEntregaCoordinada ?? solicitud.createdAt),
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

  // WorkflowRequest.assignmentIds guarda los pares en orden [viejo1, nuevo1,
  // viejo2, nuevo2, ...] (SPEC 2.84); un ticket de un solo par es [viejo, nuevo].
  const ids = solicitud.assignmentIds;
  const pares: [string, string | undefined][] = [];
  for (let i = 0; i < ids.length; i += 2) pares.push([ids[i], ids[i + 1]]);

  const porId = new Map(
    (
      await prisma.assignment.findMany({
        where: { id: { in: ids } },
        include: { asset: { include: { categoria: true } } },
      })
    ).map((a) => [a.id, a])
  );

  const equiposNuevos = pares.map(([, nuevoId]) => {
    const a = nuevoId ? porId.get(nuevoId) : undefined;
    return a
      ? filaEquipo(a.asset, 'Entregado OK', textoCargador(a, a.condicionCargadorEntrega, 'entrega'))
      : FILA_VACIA;
  });
  // El estado es el real de la devolucion (antes decia siempre "Devolución OK").
  const equiposAnteriores = pares.map(([viejoId]) => {
    const a = porId.get(viejoId);
    return a
      ? filaEquipo(
          a.asset,
          a.estadoDevolucion === 'danado'
            ? 'Devuelto dañado'
            : a.estadoDevolucion === 'no_devuelto'
              ? 'No devuelto'
              : 'Devolución OK',
          textoCargador(a, a.condicionCargadorDevolucion, 'devolucion')
        )
      : FILA_VACIA;
  });

  // Coordinacion "por OT": clausula de OT en la intro, igual que la entrega.
  const otNumero = solicitud.medioCambio === 'chilexpress' ? solicitud.otCambioChilexpress : null;

  const element = React.createElement(ComprobanteCambioTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fecha: fechaDocumento(solicitud.fechaCambioCoordinada ?? solicitud.createdAt),
    motivoCambio: solicitud.motivoCambio || '—',
    otNumero,
    equiposNuevos: equiposNuevos.length > 0 ? equiposNuevos : [FILA_VACIA],
    equiposAnteriores: equiposAnteriores.length > 0 ? equiposAnteriores : [FILA_VACIA],
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
    fechaDevolucion: fechaDocumento(solicitud.fechaDevolucionCoordinada ?? solicitud.createdAt),
    otNumero,
    assets,
    observacion: solicitud.observaciones || 'n/a',
    // Solo nombre, sin correo -- mismo criterio que el resto de los
    // documentos.
    recibidoPor: (solicitud.responsableActual || solicitud.solicitante).nombre,
  });

  return renderPdf(element);
}
