/** @jest-environment node */

/**
 * "Notificado a RRHH" deja de ser una afirmación que cualquiera puede escribir.
 *
 * Eran dos caminos, los dos falsos. El PUT aceptaba `notificadoRrhh: true` del
 * cuerpo de la petición, y **descargar** el reporte RRHH marcaba la
 * desvinculación como notificada: bastaba abrir un PDF para que el sistema
 * afirmara que RRHH estaba informada. Ahora los dos campos son propiedad del
 * servicio de notificaciones y solo se escriben cuando Graph acepta el correo.
 */

jest.mock('@/lib/auth/guard', () => ({
  ...jest.requireActual('@/lib/auth/guard'),
  requirePermission: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    termination: { findUnique: jest.fn(), update: jest.fn() },
    notificacionEnviada: { findFirst: jest.fn(), create: jest.fn() },
    documentoEmitido: { findMany: jest.fn(async () => []) },
    employee: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('@/lib/services/employeeHistoryService', () => ({
  employeeHistoryService: { registrarCambio: jest.fn(), registrarDesvinculacion: jest.fn() },
}));
jest.mock('@/lib/services/notificationService', () => ({
  prepararNotificacion: jest.fn(),
  enviarNotificacion: jest.fn(),
}));
jest.mock('@/lib/services/documentEmissionService', () => ({
  documentoArchivadoDe: jest.fn(),
}));

import { GET, PUT } from '@/app/api/desvinculaciones/[id]/route';
import { POST as NOTIFICAR } from '@/app/api/desvinculaciones/[id]/notificar/route';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/guard';
import { enviarNotificacion, prepararNotificacion } from '@/lib/services/notificationService';
import { documentoArchivadoDe } from '@/lib/services/documentEmissionService';
import { updateTerminationSchema } from '@/lib/validations/termination';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

const PARAMS = { params: Promise.resolve({ id: 'termination-1' }) };

const DESVINCULACION = {
  id: 'termination-1',
  employeeId: 'employee-1',
  notificadoRrhh: false,
  fechaNotificacionRrhh: null,
  fechaDesvinculacion: new Date('2026-03-01T00:00:00.000Z'),
  employee: {
    id: 'employee-1',
    nombres: 'Ada',
    apellidoPaterno: 'Lovelace',
    rut: '11.111.111-1',
    assignments: [],
  },
};

function pedirNotificar() {
  return NOTIFICAR(
    new NextRequest('http://localhost/api/desvinculaciones/termination-1/notificar', {
      method: 'POST',
    }),
    PARAMS
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (requirePermission as jest.Mock).mockResolvedValue({
    user: { id: 'user-1', role: 'admin', name: 'Admin IT', email: 'admin@example.com' },
  });
  (prisma.termination.findUnique as jest.Mock).mockResolvedValue(DESVINCULACION);
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
    callback({ notificacionEnviada: { create: jest.fn() }, termination: prisma.termination })
  );
  (prepararNotificacion as jest.Mock).mockResolvedValue({
    notificacionId: 'notificacion-1',
    destinatarios: ['rrhh@sclconsultores.com'],
  });
  (enviarNotificacion as jest.Mock).mockResolvedValue({
    notificacionId: 'notificacion-1',
    estado: 'enviada',
    error: null,
  });
  (documentoArchivadoDe as jest.Mock).mockResolvedValue({
    id: 'documento-acta',
    numero: 'DOC-2026-0001',
    version: 1,
  });
});

describe('el flag de notificación deja de ser editable por el cliente', () => {
  test('el schema de actualización ya no acepta notificadoRrhh', () => {
    const resultado = updateTerminationSchema.safeParse({ notificadoRrhh: true });
    const datos = resultado.success ? (resultado.data as Record<string, unknown>) : {};
    expect(datos.notificadoRrhh).toBeUndefined();
  });

  test('el PUT ignora notificadoRrhh aunque venga en el cuerpo', async () => {
    (prisma.termination.findUnique as jest.Mock).mockResolvedValue(DESVINCULACION);
    (prisma.termination.update as jest.Mock).mockResolvedValue(DESVINCULACION);

    await PUT(
      new NextRequest('http://localhost/api/desvinculaciones/termination-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notificadoRrhh: true, observaciones: 'algo' }),
      }),
      PARAMS
    );

    const [{ data }] = (prisma.termination.update as jest.Mock).mock.calls[0];
    expect(data).not.toHaveProperty('notificadoRrhh');
    expect(data).not.toHaveProperty('fechaNotificacionRrhh');
  });

  test('descargar el reporte RRHH no escribe en la base', () => {
    // Aserción estática: la garantía es que la ruta no tenga ninguna vía de
    // escritura, no que una llamada concreta no la use.
    const codigo = readFileSync(
      join(process.cwd(), 'src/app/api/desvinculaciones/[id]/reporte-rrhh/route.ts'),
      'utf8'
    );
    expect(codigo).not.toContain('termination.update');
    expect(codigo).not.toContain('notificadoRrhh: true');
  });
});

describe('POST /api/desvinculaciones/[id]/notificar', () => {
  test('envía el aviso adjuntando el acta archivada', async () => {
    const response = await pedirNotificar();

    expect(response.status).toBe(200);
    const [, params] = (prepararNotificacion as jest.Mock).mock.calls[0];
    expect(params.tipo).toBe('cierre_desvinculacion');
    expect(params.documentoIds).toEqual(['documento-acta']);
    expect(params.contexto).toEqual({ terminationId: 'termination-1' });
    expect(enviarNotificacion).toHaveBeenCalledWith('notificacion-1');
    expect((await response.json()).estado).toBe('enviada');
  });

  test('sin acta archivada no manda nada: no se fabrica un adjunto', async () => {
    (documentoArchivadoDe as jest.Mock).mockResolvedValue(null);

    const response = await pedirNotificar();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/acta/i);
    expect(prepararNotificacion).not.toHaveBeenCalled();
    expect(enviarNotificacion).not.toHaveBeenCalled();
  });

  test('reintenta la notificación fallida existente en vez de crear otra', async () => {
    (prisma.notificacionEnviada.findFirst as jest.Mock).mockResolvedValue({
      id: 'notificacion-previa',
      estado: 'fallida',
    });

    const response = await pedirNotificar();

    expect(response.status).toBe(200);
    expect(prepararNotificacion).not.toHaveBeenCalled();
    expect(enviarNotificacion).toHaveBeenCalledWith('notificacion-previa');
  });

  test('una notificación ya aceptada por Graph no se reenvía', async () => {
    (prisma.notificacionEnviada.findFirst as jest.Mock).mockResolvedValue({
      id: 'notificacion-previa',
      estado: 'enviada',
      aceptadaEn: new Date('2026-03-05T10:00:00.000Z'),
    });

    const response = await pedirNotificar();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/ya fue aceptada|ya se envió/i);
    expect(enviarNotificacion).not.toHaveBeenCalled();
  });

  test('404 cuando la desvinculación no existe', async () => {
    (prisma.termination.findUnique as jest.Mock).mockResolvedValue(null);

    expect((await pedirNotificar()).status).toBe(404);
  });

  test('exige permiso de escritura sobre desvinculaciones', async () => {
    const { ForbiddenError } = jest.requireActual('@/lib/auth/guard');
    (requirePermission as jest.Mock).mockRejectedValue(new ForbiddenError('sin permiso'));

    expect((await pedirNotificar()).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith('desvinculaciones', 'write');
  });
});

describe('GET /api/desvinculaciones/[id] — evidencia de notificación', () => {
  test('devuelve las notificaciones con sus documentos, sin cuerpos completos', async () => {
    (prisma.termination.findUnique as jest.Mock).mockResolvedValue({
      ...DESVINCULACION,
      notificacionesEnviadas: [
        {
          id: 'notificacion-1',
          tipo: 'cierre_desvinculacion',
          destinatarios: ['rrhh@sclconsultores.com'],
          asunto: 'Devolución de equipos cerrada — Ada Lovelace',
          cuerpo: 'Cuerpo largo del correo que la ficha no necesita',
          documentoIds: ['documento-acta'],
          estado: 'enviada',
          mensajeError: null,
          enviadaPor: 'Analista RRHH',
          aceptadaEn: new Date('2026-03-05T10:00:00.000Z'),
          createdAt: new Date('2026-03-05T09:59:00.000Z'),
        },
      ],
    });
    (prisma.documentoEmitido.findMany as jest.Mock).mockResolvedValue([
      { id: 'documento-acta', numero: 'DOC-2026-0001', version: 1, tipo: 'acta_devolucion' },
    ]);

    const response = await GET(
      new NextRequest('http://localhost/api/desvinculaciones/termination-1'),
      PARAMS
    );

    expect(response.status).toBe(200);
    const cuerpo = await response.json();
    expect(cuerpo.notificacionesEnviadas).toHaveLength(1);
    expect(cuerpo.notificacionesEnviadas[0]).toMatchObject({
      id: 'notificacion-1',
      estado: 'enviada',
      documentos: [{ id: 'documento-acta', numero: 'DOC-2026-0001', version: 1 }],
    });
    // El cuerpo del correo no aporta nada a la ficha y puede ser largo.
    expect(cuerpo.notificacionesEnviadas[0].cuerpo).toBeUndefined();
  });
});
