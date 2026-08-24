/** @jest-environment node */

/**
 * La evidencia que falla al archivarse tiene que verse.
 *
 * La transición calculaba con cuidado el estado de cada documento y de cada
 * aviso, y los devolvía en el 200. Nadie los leía: la ficha descartaba el cuerpo
 * entero en el camino feliz, y `GET/POST /documento/[tipo]` no tenían **ningún**
 * consumidor en la UI. Así, si SharePoint caía durante `equipos_entregados`, los
 * dos documentos quedaban `fallido`, el operador veía un 200 y una solicitud que
 * avanzó normalmente, y semanas después el cierre mandaba a RRHH un correo que
 * decía "Sin documentos archivados disponibles" — y ese correo sí quedaba
 * `enviada`. El onboarding se cerraba sin evidencia y sin forma de repararlo.
 */

jest.mock('@/lib/auth/guard', () => ({
  ...jest.requireActual('@/lib/auth/guard'),
  requirePermission: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    workflowRequest: { findUnique: jest.fn() },
    notificacionEnviada: { findFirst: jest.fn() },
  },
}));
jest.mock('@/lib/services/notificationService', () => ({ enviarNotificacion: jest.fn() }));

import { GET } from '@/app/api/solicitudes/[id]/route';
import { POST as NOTIFICAR } from '@/app/api/solicitudes/[id]/notificar/route';
import { enviarNotificacion } from '@/lib/services/notificationService';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/guard';

const PARAMS = { params: Promise.resolve({ id: 'request-1' }) };

beforeEach(() => {
  jest.clearAllMocks();
  (requirePermission as jest.Mock).mockResolvedValue({ user: { name: 'Tecnico TI' } });
  (prisma.workflowRequest.findUnique as jest.Mock).mockResolvedValue({
    id: 'request-1',
    numero: 'WF-2026-0007',
  });
  (enviarNotificacion as jest.Mock).mockResolvedValue({
    notificacionId: 'notificacion-1',
    estado: 'enviada',
    error: null,
  });
});

describe('GET /api/solicitudes/[id] — la evidencia viaja con la solicitud', () => {
  test('incluye los documentos emitidos y los avisos enviados', async () => {
    await GET(new Request('http://localhost') as never, PARAMS);

    const { include } = (prisma.workflowRequest.findUnique as jest.Mock).mock.calls[0][0];
    expect(include.documentosEmitidos).toBeDefined();
    expect(include.notificacionesEnviadas).toBeDefined();
  });

  test('no arrastra los bytes del PDF ni el snapshot ni la firma', async () => {
    // `contenidoPdf` es un BYTEA con el documento completo: sin un `select`
    // explícito, abrir la ficha descargaría todos los PDF de la solicitud.
    // `contenidoSnapshot` y `firmaEmpleado` son la misma clase de problema, y
    // además llevan la imagen de la firma manuscrita.
    await GET(new Request('http://localhost') as never, PARAMS);

    const { include } = (prisma.workflowRequest.findUnique as jest.Mock).mock.calls[0][0];
    const seleccion = include.documentosEmitidos.select;
    expect(seleccion).toBeDefined();
    for (const campo of ['contenidoPdf', 'contenidoSnapshot', 'firmaEmpleado']) {
      expect(seleccion[campo]).toBeUndefined();
    }
    // Y sí lleva lo que la ficha necesita para mostrar el estado y reintentar.
    for (const campo of ['numero', 'tipo', 'version', 'archivoEstado', 'archivoError']) {
      expect(seleccion[campo]).toBe(true);
    }
  });

  test('el aviso viaja sin su cuerpo completo', async () => {
    await GET(new Request('http://localhost') as never, PARAMS);

    const { include } = (prisma.workflowRequest.findUnique as jest.Mock).mock.calls[0][0];
    const seleccion = include.notificacionesEnviadas.select;
    expect(seleccion.cuerpo).toBeUndefined();
    for (const campo of ['estado', 'destinatarios', 'asunto', 'mensajeError', 'aceptadaEn']) {
      expect(seleccion[campo]).toBe(true);
    }
  });
});

describe('POST /api/solicitudes/[id]/notificar — el reintento que no existía', () => {
  test('reintenta el último aviso fallido de la solicitud', async () => {
    (prisma.notificacionEnviada.findFirst as jest.Mock).mockResolvedValue({
      id: 'notificacion-1',
      estado: 'fallida',
      aceptadaEn: null,
    });

    const response = await NOTIFICAR(new Request('http://localhost') as never, PARAMS);

    expect(response.status).toBe(200);
    expect(enviarNotificacion).toHaveBeenCalledWith('notificacion-1');
  });

  test('no fabrica un aviso que la transición nunca preparó', async () => {
    // El aviso lo crea la transición que cierra la solicitud, dentro de su
    // transacción. Prepararlo aquí sería inventar la evidencia de un cierre que
    // ya ocurrió.
    (prisma.notificacionEnviada.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await NOTIFICAR(new Request('http://localhost') as never, PARAMS);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/no tiene ningún aviso preparado/i);
    expect(enviarNotificacion).not.toHaveBeenCalled();
  });

  test('un aviso ya aceptado no se reenvía', async () => {
    (prisma.notificacionEnviada.findFirst as jest.Mock).mockResolvedValue({
      id: 'notificacion-1',
      estado: 'enviada',
      aceptadaEn: new Date('2026-03-05T10:00:00.000Z'),
    });

    const response = await NOTIFICAR(new Request('http://localhost') as never, PARAMS);

    expect(response.status).toBe(409);
    expect(enviarNotificacion).not.toHaveBeenCalled();
  });

  test('un aviso sin confirmar avisa que puede duplicar en vez de reintentar', async () => {
    (prisma.notificacionEnviada.findFirst as jest.Mock).mockResolvedValue({
      id: 'notificacion-1',
      estado: 'enviando',
      aceptadaEn: null,
    });

    const response = await NOTIFICAR(new Request('http://localhost') as never, PARAMS);

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/segunda copia/i);
    expect(enviarNotificacion).not.toHaveBeenCalled();
  });
});
