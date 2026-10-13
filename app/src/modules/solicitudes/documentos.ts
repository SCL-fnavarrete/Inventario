import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { AnexoEntregaTemplate } from '@/modules/solicitudes/plantillas/AnexoEntregaTemplate';
import { ComprobanteEntregaTemplate } from '@/modules/solicitudes/plantillas/ComprobanteEntregaTemplate';
import { ComprobanteCambioTemplate } from '@/modules/solicitudes/plantillas/ComprobanteCambioTemplate';
import { ActaDevolucionTemplate } from '@/modules/solicitudes/plantillas/ActaDevolucionTemplate';
import type { FilaEquipoActa } from '@/shared/pdf/TablaEquipoActa';
import type { FilaLineaActa } from '@/modules/solicitudes/plantillas/TablaLineasActa';
import { detalleSolicitud } from '@/modules/solicitudes/lecturas';
import { formatearNumero } from '@/modules/lineas';
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
  etiquetaEstadoDevolucion,
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

// Linea para su fila en la tabla de lineas del acta (SPEC 2.143).
type LineaDelDocumento = {
  numero: string;
  tipoChip: { nombre: string; sinCelular: boolean } | null;
  operador: { nombre: string } | null;
  activo: { marca: string; modelo: string } | null;
};
function filaLinea(l: LineaDelDocumento, movimiento: string): FilaLineaActa {
  return {
    numero: formatearNumero(l.numero),
    tipoChip: l.tipoChip?.nombre ?? '—',
    operador: l.operador?.nombre ?? '—',
    ubicacion: l.activo ? `${l.activo.marca} ${l.activo.modelo}` : l.tipoChip?.sinCelular ? 'eSIM de la persona' : 'Sin celular',
    movimiento,
  };
}

/**
 * Las lineas que la solicitud entrego, cambio o devolvio, con lo que paso con
 * cada una: salen del mismo detalle que ve el tecnico, asi el acta y la
 * pantalla dicen lo mismo. Sin lineas, el acta no imprime la tabla.
 */
async function lineasDelDocumento(solicitudId: string): Promise<FilaLineaActa[]> {
  const d = await detalleSolicitud(solicitudId);
  const asignada = d.lineasEntregadas.map((l) => filaLinea(l, 'Asignada'));
  const conCelular = d.lineasDevueltas.map((l) => filaLinea(l, 'Devuelta con el celular'));
  if (d.tipo === 'offboarding') return [...conCelular, ...d.esimLiberadas.flatMap((l) => (l ? [filaLinea(l, 'eSIM liberada')] : []))];
  if (d.tipo === 'cambio_equipo') {
    const cambiadas = d.lineasCambiadas.flatMap(({ anterior, nueva }) => [
      ...(anterior ? [filaLinea(anterior, 'Devuelta (queda disponible)')] : []),
      ...(nueva ? [filaLinea(nueva, 'Asignada')] : []),
    ]);
    return [...cambiadas, ...conCelular, ...asignada];
  }
  return asignada;
}

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
    filaEquipo(a.asset, etiquetaEstadoDevolucion('ok'), textoCargador(a, 'entrega'))
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
    lineas: await lineasDelDocumento(solicitudId),
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

  // Un cambio solo de lineas, o de un celular por eSIM, no tiene equipo nuevo (o anterior):
  // esa tabla no se imprime en vez de llevar una fila vacia.
  const equiposNuevos = pares.flatMap(({ nuevo: a }) =>
    a ? [filaEquipo(a.asset, etiquetaEstadoDevolucion('ok'), textoCargador(a, 'entrega'))] : []
  );
  // El estado es el real de la devolucion, con las mismas palabras de toda la app.
  const equiposAnteriores = pares.flatMap(({ anterior: a }) =>
    a
      ? [filaEquipo(a.asset, etiquetaEstadoDevolucion(a.estadoDevolucion ?? 'ok'), textoCargador(a, 'devolucion'))]
      : []
  );

  // Coordinacion "por OT": clausula de OT en la intro, igual que la entrega.
  const otNumero = solicitud.medioCambio === 'chilexpress' ? solicitud.otCambioChilexpress : null;

  const element = React.createElement(ComprobanteCambioTemplate, {
    empleadoNombre: `${solicitud.employee.nombres} ${solicitud.employee.apellidoPaterno}`,
    empleadoRut: solicitud.employee.rut || '—',
    fecha: fechaDocumento(solicitud.fechaCambioCoordinada ?? solicitud.createdAt),
    motivoCambio: solicitud.motivoCambio || '—',
    otNumero,
    equiposNuevos,
    equiposAnteriores,
    lineas: await lineasDelDocumento(solicitudId),
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
      etiquetaEstadoDevolucion(a.estadoDevolucion ?? 'ok'),
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
    lineas: await lineasDelDocumento(solicitudId),
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
