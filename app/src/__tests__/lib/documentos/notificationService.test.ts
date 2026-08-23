/** @jest-environment node */

/**
 * Notificación a RRHH por Microsoft Graph, con evidencia.
 *
 * Antes "notificado a RRHH" era un checkbox que cualquiera podía marcar, y
 * además se marcaba solo al **descargar** el reporte: bastaba con abrir un PDF
 * para que el sistema afirmara que RRHH había sido informada. Nadie sabía a
 * quién se le avisó, ni cuándo, ni si el correo salió.
 *
 * Ahora la afirmación tiene respaldo: `enviada` significa que Graph aceptó la
 * solicitud (HTTP 202), y solo entonces se tocan los flags de la
 * desvinculación. No significa que una persona la haya leído.
 */

jest.mock('@/lib/services/graphClient', () => ({
  ...jest.requireActual('@/lib/services/graphClient'),
  graphRequestAceptado: jest.fn(),
}));
jest.mock('@/lib/services/documentEmissionService', () => ({
  obtenerDocumento: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  checkNotificationConfiguration,
  enviarNotificacion,
  prepararNotificacion,
} from '@/lib/services/notificationService';
import { graphRequestAceptado } from '@/lib/services/graphClient';
import { obtenerDocumento } from '@/lib/services/documentEmissionService';
import { prisma } from '@/lib/prisma';
import { crearStoreNotificaciones } from '@/test-utils/notificacionStore';

const CONFIG = {
  GRAPH_MAIL_SENDER: 'inventario-it@sclconsultores.com',
  RRHH_NOTIFICACION_DESTINATARIOS: 'rrhh@sclconsultores.com, RRHH@sclconsultores.com ,jefatura@sclconsultores.com',
  IT_NOTIFICACION_DESTINATARIOS: 'ti@sclconsultores.com',
};

let store: ReturnType<typeof crearStoreNotificaciones>;
const pedirGraph = graphRequestAceptado as jest.Mock;
const traerDocumento = obtenerDocumento as jest.Mock;

function documentoArchivado(id = 'documento-1') {
  return {
    contenido: Buffer.from('%PDF-acta'),
    numero: 'DOC-2026-0001',
    version: 1,
    tipo: 'acta_devolucion',
    emitidoEn: new Date('2026-03-04T12:34:56.000Z'),
    documentoId: id,
  };
}

async function prepararCierre(overrides: Record<string, unknown> = {}) {
  return prepararNotificacion(store as never, {
    tipo: 'cierre_desvinculacion',
    asunto: 'Cierre de desvinculación — Ada Lovelace',
    cuerpo: 'Se adjunta el acta de devolución.',
    documentoIds: ['documento-1'],
    enviadaPor: 'Analista RRHH',
    contexto: { terminationId: 'termination-1' },
    ...overrides,
  });
}

beforeEach(() => {
  Object.assign(process.env, CONFIG);
  store = crearStoreNotificaciones();
  Object.assign(prisma as unknown as Record<string, unknown>, {
    notificacionEnviada: store.notificacionEnviada,
    termination: store.termination,
    $transaction: store.$transaction,
  });
  pedirGraph.mockReset();
  traerDocumento.mockReset();
  traerDocumento.mockResolvedValue(documentoArchivado());
});

afterEach(() => {
  for (const clave of Object.keys(CONFIG)) delete process.env[clave];
});

describe('checkNotificationConfiguration', () => {
  test('nombra las variables que faltan para poder avisar', () => {
    delete process.env.GRAPH_MAIL_SENDER;
    expect(checkNotificationConfiguration()).toEqual({
      configured: false,
      missing: ['GRAPH_MAIL_SENDER'],
    });
  });
});

describe('prepararNotificacion — dentro de la transacción del cierre', () => {
  test('crea la evidencia como pendiente, sin llamar a Graph', async () => {
    const preparada = await prepararCierre();

    const fila = store.filas[0];
    expect(fila.estado).toBe('pendiente');
    expect(fila.tipo).toBe('cierre_desvinculacion');
    expect(fila.documentoIds).toEqual(['documento-1']);
    expect(fila.terminationId).toBe('termination-1');
    expect(fila.aceptadaEn).toBeNull();
    expect(preparada.notificacionId).toBe(fila.id);
    expect(pedirGraph).not.toHaveBeenCalled();
  });

  test('los destinatarios salen del entorno, normalizados y sin repetir', async () => {
    await prepararCierre();

    expect(store.filas[0].destinatarios).toEqual([
      'rrhh@sclconsultores.com',
      'jefatura@sclconsultores.com',
    ]);
  });

  test('ignora cualquier destinatario que venga del cliente', async () => {
    await prepararCierre({ destinatarios: ['atacante@example.com'] } as never);

    expect(store.filas[0].destinatarios).not.toContain('atacante@example.com');
  });

  test('la alerta de equipos pendientes también avisa a TI', async () => {
    await prepararCierre({
      tipo: 'alerta_equipos_pendientes',
      contexto: {},
      documentoIds: [],
    });

    expect(store.filas[0].destinatarios).toContain('ti@sclconsultores.com');
  });
});

describe('enviarNotificacion — después del commit', () => {
  test('Graph acepta: marca enviada y los flags de la desvinculación en una transacción', async () => {
    const { notificacionId } = await prepararCierre();
    pedirGraph.mockResolvedValue(202);

    const resultado = await enviarNotificacion(notificacionId);

    expect(resultado.estado).toBe('enviada');
    const fila = store.filas[0];
    expect(fila.estado).toBe('enviada');
    expect(fila.aceptadaEn).toBeInstanceOf(Date);
    expect(store.terminaciones['termination-1']).toMatchObject({ notificadoRrhh: true });
    expect(store.terminaciones['termination-1'].fechaNotificacionRrhh).toEqual(fila.aceptadaEn);
    // La evidencia y el flag de compatibilidad se escriben juntos o no se
    // escriben: un flag en true sin notificación es la mentira que se estaba
    // corrigiendo.
    expect(store.transaccionesConfirmadas).toBe(1);
  });

  test('envía por el buzón de servicio con los adjuntos verificados', async () => {
    const { notificacionId } = await prepararCierre();
    pedirGraph.mockResolvedValue(202);

    await enviarNotificacion(notificacionId);

    const [url, opciones] = pedirGraph.mock.calls[0];
    expect(url).toBe(
      'https://graph.microsoft.com/v1.0/users/inventario-it%40sclconsultores.com/sendMail'
    );
    const payload = JSON.parse(opciones.body as string);
    expect(payload.message.toRecipients.map((r: { emailAddress: { address: string } }) => r.emailAddress.address)).toEqual([
      'rrhh@sclconsultores.com',
      'jefatura@sclconsultores.com',
    ]);
    // Texto plano: el cuerpo lleva datos del empleado y no hay HTML que
    // escapar mal.
    expect(payload.message.body.contentType).toBe('Text');
    expect(payload.message.attachments).toHaveLength(1);
    expect(payload.message.attachments[0]).toMatchObject({
      contentType: 'application/pdf',
      name: 'DOC-2026-0001_v1.pdf',
    });
    expect(Buffer.from(payload.message.attachments[0].contentBytes, 'base64').toString()).toBe(
      '%PDF-acta'
    );
  });

  test('un documento no archivado o con hash roto bloquea el envío', async () => {
    const { notificacionId } = await prepararCierre();
    const { ServiceConflictError } = jest.requireActual('@/lib/errors/serviceOperationError');
    traerDocumento.mockRejectedValue(
      new ServiceConflictError('Integridad comprometida: el archivo no coincide con el hash emitido')
    );

    const resultado = await enviarNotificacion(notificacionId);

    expect(resultado.estado).toBe('fallida');
    expect(pedirGraph).not.toHaveBeenCalled();
    expect(store.filas[0].mensajeError).toMatch(/integridad/i);
    expect(store.terminaciones['termination-1']).toBeUndefined();
  });

  test('un fallo de Graph deja fallida y la desvinculación sin notificar', async () => {
    const { notificacionId } = await prepararCierre();
    pedirGraph.mockRejectedValue(new Error('sendMail: Microsoft Graph respondio 403 (request-id req-3)'));

    const resultado = await enviarNotificacion(notificacionId);

    expect(resultado.estado).toBe('fallida');
    expect(store.filas[0].estado).toBe('fallida');
    expect(store.filas[0].mensajeError).toContain('403');
    expect(store.filas[0].aceptadaEn).toBeNull();
    expect(store.terminaciones['termination-1']).toBeUndefined();
  });

  test('sin configuración no llama a Graph y lo dice', async () => {
    const { notificacionId } = await prepararCierre();
    delete process.env.GRAPH_MAIL_SENDER;

    const resultado = await enviarNotificacion(notificacionId);

    expect(resultado.estado).toBe('fallida');
    expect(store.filas[0].mensajeError).toMatch(/GRAPH_MAIL_SENDER/);
    expect(pedirGraph).not.toHaveBeenCalled();
  });

  test('reintentar una notificación ya enviada no manda un segundo correo', async () => {
    const { notificacionId } = await prepararCierre();
    pedirGraph.mockResolvedValue(202);
    await enviarNotificacion(notificacionId);
    pedirGraph.mockClear();

    const resultado = await enviarNotificacion(notificacionId);

    expect(resultado.estado).toBe('enviada');
    expect(pedirGraph).not.toHaveBeenCalled();
    expect(store.filas).toHaveLength(1);
  });

  test('el reintento de una fallida reutiliza la misma fila de evidencia', async () => {
    const { notificacionId } = await prepararCierre();
    pedirGraph.mockRejectedValueOnce(new Error('Graph caido'));
    await enviarNotificacion(notificacionId);
    pedirGraph.mockResolvedValue(202);

    const resultado = await enviarNotificacion(notificacionId);

    expect(resultado.estado).toBe('enviada');
    expect(store.filas).toHaveLength(1);
    expect(store.filas[0].mensajeError).toBeNull();
  });

  test('rechaza adjuntos que superan el límite de sendMail antes de intentarlo', async () => {
    const { notificacionId } = await prepararCierre();
    traerDocumento.mockResolvedValue({
      ...documentoArchivado(),
      contenido: Buffer.alloc(3 * 1024 * 1024 + 1),
    });

    const resultado = await enviarNotificacion(notificacionId);

    expect(resultado.estado).toBe('fallida');
    expect(store.filas[0].mensajeError).toMatch(/adjunt/i);
    expect(pedirGraph).not.toHaveBeenCalled();
  });

  test('una alerta sin desvinculación asociada no toca ningún flag', async () => {
    const { notificacionId } = await prepararCierre({
      tipo: 'alerta_equipos_pendientes',
      contexto: {},
      documentoIds: [],
    });
    pedirGraph.mockResolvedValue(202);

    await enviarNotificacion(notificacionId);

    expect(store.filas[0].estado).toBe('enviada');
    expect(Object.keys(store.terminaciones)).toHaveLength(0);
  });
});

/**
 * El asunto y el cuerpo los arma el servidor, así que hoy no pueden ser
 * arbitrarios. El límite existe igual: el día que un aviso incluya un campo
 * escrito por una persona —observaciones, motivo de descuento— la alternativa
 * sería que Graph rechace el mensaje entero por tamaño.
 */
describe('límites de asunto y cuerpo', () => {
  test('recorta el asunto y el cuerpo dejando dicho que se recortaron', async () => {
    await prepararCierre({ asunto: 'A'.repeat(400), cuerpo: 'B'.repeat(40000) });

    const fila = store.filas[0];
    expect(fila.asunto.length).toBeLessThanOrEqual(255);
    expect(fila.asunto.endsWith('…')).toBe(true);
    expect(fila.cuerpo.length).toBeLessThanOrEqual(20000);
    expect(fila.cuerpo).toContain('[texto recortado]');
  });

  test('no toca un asunto y un cuerpo de tamaño normal', async () => {
    await prepararCierre();

    expect(store.filas[0].asunto).toBe('Cierre de desvinculación — Ada Lovelace');
    expect(store.filas[0].cuerpo).toBe('Se adjunta el acta de devolución.');
  });
});
