import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { AnexoEntregaTemplate } from '@/modules/solicitudes/plantillas/AnexoEntregaTemplate';
import { ComprobanteEntregaTemplate } from '@/modules/solicitudes/plantillas/ComprobanteEntregaTemplate';
import { ComprobanteCambioTemplate } from '@/modules/solicitudes/plantillas/ComprobanteCambioTemplate';
import { ActaDevolucionTemplate } from '@/modules/solicitudes/plantillas/ActaDevolucionTemplate';
import type { FilaEquipoActa } from '@/modules/solicitudes/plantillas/TablaEquipoActa';
import { prisma } from '@/shared/prisma';
import {
  asignacionesDelTicket,
  devueltaEnTicket,
  devueltasDespues,
  paresDeCambio,
} from '@/modules/solicitudes/consultasAsignaciones';
import { NotFoundError, ValidationError } from '@/shared/errores';
import {
  especificacionesActivo,
  LINEAS_DEL_EQUIPO,
  type ActivoParaSpecs,
  etiquetaCondicionCargador,
  type ContextoCargador,
} from '@/modules/activos';
import { formatearFecha } from "@/shared/utilidades/fechas";

/** De quien gestiono la solicitud, los PDF solo imprimen el nombre: no se lee nada mas de su cuenta. */
const SOLO_NOMBRE = { select: { nombre: true } } as const;

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

// Fila de la tabla de equipos de un acta (TablaEquipoActa). El N° de serie y
// las especificaciones van en columnas propias; la descripcion queda para el
// modelo y la condicion del cargador, sin repetir lo anterior.
export function filaEquipo(
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
    numeroSerie: asset.numeroSerie || asset.imei || null,
    descripcion: asset.modelo,
    especificaciones: especificacionesActivo({
      ...asset,
      imei: asset.numeroSerie ? asset.imei : null,
      pulgadas: asset.pulgadas?.toString() ?? null,
    })
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

// Cargador para su fila en la tabla del acta: la condicion y la observacion
// del momento que muestra el acta, entrega o devolucion (SPEC 2.121: cada una
// tiene la suya). Null si el equipo no tiene cargador o nunca se registro.
function textoCargador(
  asignacion: {
    condicionCargadorEntrega: string | null;
    condicionCargadorDevolucion: string | null;
    observacionesCargadorEntrega: string | null;
    observacionesCargadorDevolucion: string | null;
  },
  contexto: ContextoCargador
): FilaEquipoActa['cargador'] {
  const [condicion, observacion] =
    contexto === 'entrega'
      ? [asignacion.condicionCargadorEntrega, asignacion.observacionesCargadorEntrega]
      : [asignacion.condicionCargadorDevolucion, asignacion.observacionesCargadorDevolucion];
  const etiqueta = etiquetaCondicionCargador(condicion, contexto);
  if (!etiqueta) return null;
  return { condicion: etiqueta, observacion: observacion?.trim() || null };
}

export async function generateAnexoEntrega(solicitudId: string): Promise<Buffer> {
  const solicitud = await prisma.workflowRequest.findUniqueOrThrow({
    where: { id: solicitudId },
    include: {
      employee: {
        include: {
          assignments: {
            where: { activo: true },
            include: { asset: { include: { categoria: true, lineas: LINEAS_DEL_EQUIPO } } },
          },
        },
      },
      solicitante: SOLO_NOMBRE,
      responsableActual: SOLO_NOMBRE,
    },
  });

  // Solo los equipos entregados en este ticket: el empleado pudo cambiar de
  // equipo o desvincularse despues.
  const asignaciones =
    solicitud.assignmentIds.length > 0
      ? await asignacionesDelTicket(solicitud.assignmentIds)
      : solicitud.employee.assignments;
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
            include: { asset: { include: { categoria: true, lineas: LINEAS_DEL_EQUIPO } } },
          },
        },
      },
      solicitante: SOLO_NOMBRE,
      responsableActual: SOLO_NOMBRE,
    },
  });

  // Solo los equipos entregados en este ticket (ver generateAnexoEntrega).
  const asignaciones =
    solicitud.assignmentIds.length > 0
      ? await asignacionesDelTicket(solicitud.assignmentIds)
      : solicitud.employee.assignments;
  const assets = asignaciones.map((a) =>
    filaEquipo(a.asset, 'OK', textoCargador(a, 'entrega'))
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
      solicitante: SOLO_NOMBRE,
      responsableActual: SOLO_NOMBRE,
    },
  });

  // Un par por equipo cambiado (SPEC 2.84), en el orden del ticket.
  const pares = paresDeCambio(
    solicitud.assignmentIds,
    await asignacionesDelTicket(solicitud.assignmentIds)
  );

  const equiposNuevos = pares.map(({ nuevo: a }) =>
    a
      ? filaEquipo(a.asset, 'Entregado OK', textoCargador(a, 'entrega'))
      : FILA_VACIA
  );
  // El estado es el real de la devolucion (antes decia siempre "Devolución OK").
  const equiposAnteriores = pares.map(({ anterior: a }) =>
    a
      ? filaEquipo(
          a.asset,
          a.estadoDevolucion === 'danado'
            ? 'Devuelto dañado'
            : a.estadoDevolucion === 'no_devuelto'
              ? 'No devuelto'
              : a.estadoDevolucion === 'baja'
                ? 'Baja'
                : 'Devolución OK',
          textoCargador(a, 'devolucion')
        )
      : FILA_VACIA
  );

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
            include: { asset: { include: { categoria: true, lineas: LINEAS_DEL_EQUIPO } } },
            orderBy: { fechaEntrega: 'desc' },
          },
        },
      },
      solicitante: SOLO_NOMBRE,
      responsableActual: SOLO_NOMBRE,
    },
  });

  // Solo lo DEVUELTO en este ticket (assignmentIds): un equipo "No devuelto"
  // no se entrego, asi que no va en un acta de devolucion (SPEC 2.87). Antes
  // se listaba con estado "No devuelto" y con espacio para la firma del
  // colaborador. Tickets antiguos sin assignmentIds conservan el criterio
  // anterior (asignaciones cerradas con fecha de devolucion).
  // Un equipo entregado despues en otro ticket (recuperacion) va en el acta
  // de ESE ticket, no en esta.
  const recuperadas = await devueltasDespues(solicitud);
  const returnedAssignments =
    solicitud.assignmentIds.length > 0
      ? (await asignacionesDelTicket(solicitud.assignmentIds)).filter((a) =>
          devueltaEnTicket(a, recuperadas)
        )
      : solicitud.employee.assignments.filter((a) => !a.activo && a.fechaDevolucion);

  if (returnedAssignments.length === 0) {
    throw new ValidationError(
      'No hay equipos devueltos en esta solicitud: el acta se genera solo con lo que se devuelve.'
    );
  }

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
      textoCargador(a, 'devolucion')
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

/** Documentos que se descargan de una solicitud y el nombre de su archivo. */
const NOMBRES_DOCUMENTO = {
  'anexo-entrega': 'Anexo_Entrega_Equipos',
  'comprobante-entrega': 'Comprobante_Entrega',
  'comprobante-cambio': 'Comprobante_Cambio',
  'acta-devolucion': 'Acta_Devolucion',
} as const;
type TipoDocumento = keyof typeof NOMBRES_DOCUMENTO;

const GENERADORES: Record<TipoDocumento, (solicitudId: string) => Promise<Buffer>> = {
  'anexo-entrega': generateAnexoEntrega,
  'comprobante-entrega': generateComprobanteEntrega,
  'comprobante-cambio': generateComprobanteCambio,
  'acta-devolucion': generateActaDevolucion,
};

/** PDF de una solicitud (GET /api/solicitudes/[id]/documento/[tipo]). */
export async function documentoDeSolicitud(id: string, tipo: string) {
  if (!Object.hasOwn(NOMBRES_DOCUMENTO, tipo)) {
    throw new ValidationError(`Tipo de documento inválido. Opciones: ${Object.keys(NOMBRES_DOCUMENTO).join(', ')}`);
  }
  const solicitud = await prisma.workflowRequest.findUnique({ where: { id }, select: { numero: true } });
  if (!solicitud) throw new NotFoundError('Solicitud no encontrada');
  const clave = tipo as TipoDocumento;
  return {
    pdf: await GENERADORES[clave](id),
    nombreArchivo: `${NOMBRES_DOCUMENTO[clave]}_${solicitud.numero}.pdf`,
  };
}
