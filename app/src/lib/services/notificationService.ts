import { Prisma, type EstadoNotificacion, type TipoNotificacion } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { GraphError, graphRequestAceptado } from '@/lib/services/graphClient';
import { obtenerDocumento } from '@/lib/services/documentEmissionService';

type PrismaTx = Prisma.TransactionClient;

/**
 * Aviso a RRHH por Microsoft Graph, con evidencia.
 *
 * "Notificado a RRHH" era un checkbox editable desde el cliente, y ademas se
 * marcaba solo al **descargar** el reporte: bastaba abrir un PDF para que el
 * sistema afirmara que RRHH estaba informada. Nadie sabia a quien se le aviso,
 * ni cuando, ni si el correo llego a salir.
 *
 * Ahora la afirmacion tiene respaldo, y en dos etapas como el archivo de
 * documentos (SPEC 2.1 septies):
 *
 *  1. `prepararNotificacion` corre **dentro** de la transaccion del cierre y
 *     crea la fila `pendiente` con destinatarios, asunto, cuerpo y los
 *     documentos que va a adjuntar.
 *  2. `enviarNotificacion` corre **despues del commit**: baja cada adjunto por
 *     el servicio de documentos —que verifica su hash—, llama a Graph y, solo
 *     si Graph acepta, marca `enviada` y los flags de compatibilidad de la
 *     desvinculacion, en una sola transaccion.
 *
 * `enviada` significa que Graph acepto la solicitud (HTTP 202). No significa
 * que una persona la haya recibido ni leido.
 */

const VARIABLES_REQUERIDAS = ['GRAPH_MAIL_SENDER', 'RRHH_NOTIFICACION_DESTINATARIOS'] as const;

/**
 * Tope conservador del total de adjuntos en base64.
 *
 * `sendMail` acepta un mensaje de hasta 4 MB, y base64 infla los bytes en un
 * tercio. Cortar aqui da un error accionable en vez de un 413 opaco de Graph.
 */
const LIMITE_ADJUNTOS_BASE64 = 3 * 1024 * 1024;
const LIMITE_ERROR = 500;

/**
 * Cotas del asunto y del cuerpo.
 *
 * Hoy los arma el servidor, asi que no pueden ser arbitrarios. El limite existe
 * igual: el dia que un aviso incluya un campo escrito por una persona
 * —observaciones, motivo de descuento— la alternativa seria que Graph rechace
 * el mensaje entero por tamano. Se recorta diciendo que se recorto, para que
 * nadie lea un texto truncado creyendolo completo.
 */
const LIMITE_ASUNTO = 255;
const LIMITE_CUERPO = 20_000;
const MARCA_RECORTE = '\n\n[texto recortado]';

function recortar(texto: string, limite: number, marca: string): string {
  if (texto.length <= limite) return texto;
  return texto.slice(0, limite - marca.length) + marca;
}
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NotificationConfigurationStatus {
  configured: boolean;
  missing: string[];
}

export function checkNotificationConfiguration(): NotificationConfigurationStatus {
  const missing = VARIABLES_REQUERIDAS.filter((clave) => !process.env[clave]);
  return { configured: missing.length === 0, missing: [...missing] };
}

/**
 * Los destinatarios salen del entorno del servidor y de ningun otro lado.
 *
 * Aceptar una lista del navegador convertiria el buzon de servicio en un
 * relay: cualquiera con permiso de cerrar una desvinculacion podria mandar un
 * correo firmado por la empresa, con adjuntos, a donde quisiera.
 */
function destinatariosDe(variable: string): string[] {
  return (process.env[variable] || '')
    .split(',')
    .map((correo) => correo.trim().toLowerCase())
    .filter((correo) => FORMATO_CORREO.test(correo));
}

function destinatariosPorTipo(tipo: TipoNotificacion): string[] {
  const rrhh = destinatariosDe('RRHH_NOTIFICACION_DESTINATARIOS');
  // La alerta de equipos pendientes es operativa: TI es quien va a perseguir
  // el equipo, RRHH quien necesita saber que sigue afuera.
  const ti =
    tipo === 'alerta_equipos_pendientes' ? destinatariosDe('IT_NOTIFICACION_DESTINATARIOS') : [];
  return [...new Set([...rrhh, ...ti])];
}

export type ContextoNotificacion = {
  requestId?: string | null;
  terminationId?: string | null;
};

export type NotificacionPreparada = {
  notificacionId: string;
  destinatarios: string[];
};

export async function prepararNotificacion(
  tx: PrismaTx,
  params: {
    tipo: TipoNotificacion;
    asunto: string;
    cuerpo: string;
    documentoIds: string[];
    enviadaPor: string;
    contexto: ContextoNotificacion;
  }
): Promise<NotificacionPreparada> {
  const destinatarios = destinatariosPorTipo(params.tipo);

  const notificacion = await tx.notificacionEnviada.create({
    data: {
      tipo: params.tipo,
      destinatarios,
      asunto: recortar(params.asunto, LIMITE_ASUNTO, '…'),
      cuerpo: recortar(params.cuerpo, LIMITE_CUERPO, MARCA_RECORTE),
      documentoIds: params.documentoIds,
      estado: 'pendiente',
      enviadaPor: params.enviadaPor,
      requestId: params.contexto.requestId ?? null,
      terminationId: params.contexto.terminationId ?? null,
    },
  });

  return { notificacionId: notificacion.id, destinatarios };
}

export type ResultadoEnvio = {
  notificacionId: string;
  estado: EstadoNotificacion;
  error: string | null;
};

function errorSaneado(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : 'Error desconocido al notificar';
  return mensaje.slice(0, LIMITE_ERROR);
}

/**
 * Deja la notificacion `fallida`. Solo se llama por errores ocurridos **antes**
 * de que Graph acepte: desde el 202 el correo salio y marcarlo como fallido es
 * lo que hace que alguien reintente y lo duplique.
 *
 * El filtro de estado importa: sin el, un intento perdedor pisaba el resultado
 * de otro que si habia salido, y la evidencia se contradecia.
 */
async function degradarAFallida(notificacionId: string, error: unknown): Promise<string> {
  const mensajeError = errorSaneado(error);
  await prisma.notificacionEnviada.updateMany({
    where: { id: notificacionId, estado: { not: 'enviada' } },
    data: { estado: 'fallida', mensajeError },
  });
  return mensajeError;
}

/**
 * Anota un error **sin** tocar el estado. Es el caso de un fallo posterior al
 * 202: el correo salio, asi que el estado no puede decir que no, pero el fallo
 * tampoco puede desaparecer -- alguien tiene que poder ver que Graph acepto y
 * no se alcanzo a registrar.
 */
async function anotarErrorSinDegradar(notificacionId: string, error: unknown): Promise<string> {
  const mensajeError = errorSaneado(error);
  await prisma.notificacionEnviada.updateMany({
    where: { id: notificacionId, estado: { not: 'enviada' } },
    data: { mensajeError },
  });
  return mensajeError;
}

async function adjuntosDe(documentoIds: string[]) {
  const adjuntos = [];
  let total = 0;

  for (const documentoId of documentoIds) {
    // `obtenerDocumento` exige que el documento este archivado y verifica su
    // hash. Un adjunto fabricado desde datos vivos no es la evidencia.
    const documento = await obtenerDocumento(documentoId);
    const contentBytes = documento.contenido.toString('base64');
    total += contentBytes.length;
    if (total > LIMITE_ADJUNTOS_BASE64) {
      throw new Error(
        `Los adjuntos superan el limite de sendMail (${Math.round(LIMITE_ADJUNTOS_BASE64 / 1024)} KB en base64). Enviar el aviso con enlaces al archivo en vez de adjuntos.`
      );
    }
    adjuntos.push({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: `${documento.numero}_v${documento.version}.pdf`,
      contentType: 'application/pdf',
      contentBytes,
    });
  }

  return adjuntos;
}

/**
 * Envia la notificacion y registra lo que efectivamente paso.
 *
 * No lanza: un fallo de correo no puede tumbar la respuesta de un cierre que
 * ya ocurrio. Deja `fallida` con su error saneado, y el reintento es explicito.
 *
 * **El envio esta partido en tres etapas, y solo las dos primeras degradan a
 * `fallida`.** Preparar y enviar ocurren antes de que Graph acepte, asi que un
 * fallo ahi significa que no salio nada. Registrar ocurre despues del 202: el
 * correo salio, y marcarlo como fallido es lo que hace que alguien reintente y
 * RRHH reciba el acta dos veces. Un fallo en la etapa 3 se anota sin tocar el
 * estado.
 *
 * *Riesgo conocido:* si Graph acepta el mensaje pero la respuesta se pierde en
 * el camino -- antes de llegar aqui--, el intento queda sin confirmar y un
 * reintento manda un segundo correo. No hay forma de evitarlo sin un
 * identificador de idempotencia que `sendMail` no ofrece; se prefiere un
 * duplicado visible a una notificacion que nadie sabe si salio.
 */
export async function enviarNotificacion(notificacionId: string): Promise<ResultadoEnvio> {
  const notificacion = await prisma.notificacionEnviada.findUnique({
    where: { id: notificacionId },
  });
  if (!notificacion) {
    return { notificacionId, estado: 'fallida', error: 'Notificacion no encontrada' };
  }

  // Guard contra el doble envio: una fila ya aceptada por Graph no se reenvia.
  if (notificacion.estado === 'enviada') {
    return { notificacionId, estado: 'enviada', error: null };
  }

  // --- Etapa 1: preparar. Nada salio todavia, asi que un fallo aqui si degrada.
  let attachments: Awaited<ReturnType<typeof adjuntosDe>>;
  let remitente: string;
  try {
    const { configured, missing } = checkNotificationConfiguration();
    if (!configured) {
      throw new Error(
        `Notificacion por correo sin configurar. Falta definir: ${missing.join(', ')}`
      );
    }
    if (notificacion.destinatarios.length === 0) {
      throw new Error('La notificacion no tiene destinatarios validos configurados');
    }

    attachments = await adjuntosDe(notificacion.documentoIds);
    remitente = process.env.GRAPH_MAIL_SENDER as string;
  } catch (error) {
    return {
      notificacionId,
      estado: 'fallida',
      error: await degradarAFallida(notificacionId, error),
    };
  }

  // --- Etapa 2: enviar. Es el ultimo punto donde degradar sigue siendo correcto.
  try {
    await graphRequestAceptado(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(remitente)}/sendMail`,
      {
        method: 'POST',
        contentType: 'application/json',
        operacion: 'No se pudo enviar la notificacion por Microsoft Graph',
        body: JSON.stringify({
          message: {
            subject: notificacion.asunto,
            // Texto plano a proposito: el cuerpo lleva nombre, RUT y
            // observaciones escritas por personas, y en HTML cada uno de esos
            // campos seria una inyeccion esperando ocurrir.
            body: { contentType: 'Text', content: notificacion.cuerpo },
            toRecipients: notificacion.destinatarios.map((address) => ({
              emailAddress: { address },
            })),
            attachments,
          },
          saveToSentItems: true,
        }),
      }
    );
  } catch (error) {
    return {
      notificacionId,
      estado: 'fallida',
      error: await degradarAFallida(notificacionId, error),
    };
  }

  // --- Etapa 3: registrar. Graph acepto: el correo salio. Desde aqui ningun
  // error puede escribir `fallida`, porque eso es exactamente lo que hace que
  // alguien reintente y RRHH reciba el acta dos veces.
  const aceptadaEn = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      // El filtro de estado evita que dos envios simultaneos marquen la misma
      // fila dos veces.
      const reclamada = await tx.notificacionEnviada.updateMany({
        where: { id: notificacionId, estado: { not: 'enviada' } },
        data: { estado: 'enviada', aceptadaEn, mensajeError: null },
      });

      // Si otro intento gano la carrera, su `aceptadaEn` es el que vale: pisar
      // los flags con la marca de este intento los desalinearia de la evidencia
      // que deben respaldar.
      if (reclamada.count === 0) return;

      // Los flags de `terminations` son de compatibilidad y los escribe solo
      // este servicio, junto con la evidencia que los respalda.
      if (notificacion.terminationId && notificacion.tipo === 'cierre_desvinculacion') {
        await tx.termination.update({
          where: { id: notificacion.terminationId },
          data: { notificadoRrhh: true, fechaNotificacionRrhh: aceptadaEn },
        });
      }
    });

    return { notificacionId, estado: 'enviada', error: null };
  } catch (error) {
    // El correo salio pero no se pudo registrar. Se anota el error y se
    // devuelve el estado que la fila tiene de verdad, sin inventar uno.
    const mensajeError = await anotarErrorSinDegradar(notificacionId, error);
    const actual = await prisma.notificacionEnviada.findUnique({
      where: { id: notificacionId },
      select: { estado: true },
    });
    return { notificacionId, estado: actual?.estado ?? notificacion.estado, error: mensajeError };
  }
}

/** Envia varias sin que el fallo de una detenga a las demas. */
export async function enviarNotificaciones(
  notificaciones: Array<{ notificacionId: string }>
): Promise<ResultadoEnvio[]> {
  const resultados: ResultadoEnvio[] = [];
  for (const notificacion of notificaciones) {
    resultados.push(await enviarNotificacion(notificacion.notificacionId));
  }
  return resultados;
}

export { GraphError };
