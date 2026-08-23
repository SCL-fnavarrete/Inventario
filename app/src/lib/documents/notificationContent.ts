/**
 * Asunto y cuerpo de cada aviso.
 *
 * Vive aparte del servicio y sin dependencias: es texto, se prueba como texto.
 * Todo es texto plano —`contentType: 'Text'` en Graph— porque el cuerpo lleva
 * nombres, RUT y observaciones escritas por personas: en HTML cada uno de esos
 * campos seria una inyeccion esperando ocurrir.
 */

const PIE = '\n\n—\nMensaje automático del Sistema de Inventario IT. No responder a este correo.';

function lineas(...partes: Array<string | null | undefined>): string {
  return partes.filter((parte): parte is string => Boolean(parte)).join('\n');
}

export function contenidoCierreOnboarding(datos: {
  numeroSolicitud: string;
  empleado: string;
  rut: string | null;
  cargo: string | null;
  documentos: Array<{ numero: string; version: number }>;
}) {
  return {
    asunto: `Onboarding cerrado — ${datos.empleado} (${datos.numeroSolicitud})`,
    cuerpo:
      lineas(
        `La solicitud de onboarding ${datos.numeroSolicitud} quedó cerrada.`,
        '',
        `Colaborador: ${datos.empleado}`,
        `RUT: ${datos.rut || '—'}`,
        `Cargo: ${datos.cargo || '—'}`,
        '',
        datos.documentos.length
          ? `Se adjuntan los documentos firmados:\n${datos.documentos
              .map((documento) => `  · ${documento.numero} v${documento.version}`)
              .join('\n')}`
          : 'Sin documentos archivados disponibles para adjuntar al momento del cierre.'
      ) + PIE,
  };
}

export function contenidoCierreDesvinculacion(datos: {
  numeroSolicitud: string | null;
  empleado: string;
  rut: string | null;
  fechaDesvinculacion: Date | null;
  documentos: Array<{ numero: string; version: number }>;
}) {
  const referencia = datos.numeroSolicitud ? ` (${datos.numeroSolicitud})` : '';
  return {
    asunto: `Devolución de equipos cerrada — ${datos.empleado}${referencia}`,
    cuerpo:
      lineas(
        `Se cerró la devolución de equipos de ${datos.empleado}.`,
        '',
        `RUT: ${datos.rut || '—'}`,
        `Fecha de desvinculación: ${
          datos.fechaDesvinculacion ? datos.fechaDesvinculacion.toISOString().slice(0, 10) : '—'
        }`,
        '',
        datos.documentos.length
          ? `Se adjunta el acta de devolución firmada:\n${datos.documentos
              .map((documento) => `  · ${documento.numero} v${documento.version}`)
              .join('\n')}`
          : 'El acta de devolución todavía no está archivada; se enviará al reintentar el aviso.'
      ) + PIE,
  };
}

export function contenidoAlertaEquiposPendientes(datos: {
  empleado: string;
  rut: string | null;
  correo: string;
  equipos: number;
}) {
  return {
    asunto: `Cuenta deshabilitada con equipos pendientes — ${datos.empleado}`,
    cuerpo:
      lineas(
        `La cuenta de ${datos.empleado} quedó deshabilitada en Microsoft Entra ID y el sistema la marcó como desvinculada, pero todavía tiene ${datos.equipos} equipo(s) asignado(s).`,
        '',
        `RUT: ${datos.rut || '—'}`,
        `Correo: ${datos.correo}`,
        '',
        'Coordinar la devolución y cerrarla en el sistema para que el acta quede emitida.'
      ) + PIE,
  };
}
