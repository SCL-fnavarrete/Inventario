/** @jest-environment node */

/**
 * La ruta de documento deja de generar PDFs en vivo.
 *
 * Antes cada descarga volvia a consultar la base y a renderizar: el "acta" de
 * una entrega de marzo mostraba los equipos que la persona tuviera hoy y una
 * fecha de pie distinta en cada clic. Ahora GET entrega el archivo inmutable
 * que se emitio con el acto, y si no existe lo dice en vez de fabricar uno.
 */

jest.mock('@/lib/auth/guard', () => ({
  ...jest.requireActual('@/lib/auth/guard'),
  requirePermission: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: { workflowRequest: { findUnique: jest.fn() } },
}));
jest.mock('@/lib/services/documentEmissionService', () => ({
  documentoArchivadoDe: jest.fn(),
  ultimoDocumentoDe: jest.fn(),
  obtenerDocumento: jest.fn(),
  archivarDocumento: jest.fn(),
  reemitir: jest.fn(),
}));

import { GET, POST } from '@/app/api/solicitudes/[id]/documento/[tipo]/route';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/guard';
import {
  archivarDocumento,
  documentoArchivadoDe,
  obtenerDocumento,
  reemitir,
  ultimoDocumentoDe,
} from '@/lib/services/documentEmissionService';
import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

const PARAMS = { params: Promise.resolve({ id: 'request-1', tipo: 'acta-devolucion' }) };

function pedirGet() {
  return GET(new NextRequest('http://localhost/api/solicitudes/request-1/documento/acta-devolucion'), PARAMS);
}

function pedirPost(body: Record<string, unknown> = {}) {
  return POST(
    new NextRequest('http://localhost/api/solicitudes/request-1/documento/acta-devolucion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    PARAMS
  );
}

const DOCUMENTO_ARCHIVADO = {
  id: 'documento-1',
  numero: 'DOC-2026-0001',
  version: 1,
  tipo: 'acta_devolucion',
  archivoEstado: 'archivado',
};

beforeEach(() => {
  (requirePermission as jest.Mock).mockResolvedValue({
    user: { id: 'user-1', role: 'tecnico', name: 'Tecnico TI' },
  });
  (prisma.workflowRequest.findUnique as jest.Mock).mockResolvedValue({
    id: 'request-1',
    numero: 'WF-2026-0007',
    tipo: 'devolucion_termino',
    estado: 'consolidacion_cierre',
  });
});

describe('GET — entrega el archivo inmutable', () => {
  test('devuelve los bytes archivados con un nombre estable por numero y version', async () => {
    (documentoArchivadoDe as jest.Mock).mockResolvedValue(DOCUMENTO_ARCHIVADO);
    (obtenerDocumento as jest.Mock).mockResolvedValue({
      contenido: Buffer.from('%PDF-archivado'),
      numero: 'DOC-2026-0001',
      version: 1,
      tipo: 'acta_devolucion',
      emitidoEn: new Date('2026-03-04T12:34:56.000Z'),
    });

    const response = await pedirGet();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(
      'Acta_Devolucion_DOC-2026-0001_v1.pdf'
    );
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('%PDF-archivado');
  });

  test('404 cuando la solicitud nunca emitio ese documento', async () => {
    (documentoArchivadoDe as jest.Mock).mockResolvedValue(null);
    (ultimoDocumentoDe as jest.Mock).mockResolvedValue(null);

    const response = await pedirGet();

    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatch(/no se ha emitido/i);
    expect(obtenerDocumento).not.toHaveBeenCalled();
  });

  test('409 explicito cuando el documento existe pero su archivo esta pendiente', async () => {
    (documentoArchivadoDe as jest.Mock).mockResolvedValue(null);
    (ultimoDocumentoDe as jest.Mock).mockResolvedValue({
      ...DOCUMENTO_ARCHIVADO,
      archivoEstado: 'pendiente',
    });

    const response = await pedirGet();

    expect(response.status).toBe(409);
    const cuerpo = await response.json();
    expect(cuerpo.error).toMatch(/pendiente/i);
    expect(cuerpo.details).toMatchObject({ archivoEstado: 'pendiente', numero: 'DOC-2026-0001' });
  });

  test('409 cuando el archivo dejo de coincidir con el hash emitido', async () => {
    (documentoArchivadoDe as jest.Mock).mockResolvedValue(DOCUMENTO_ARCHIVADO);
    const { ServiceConflictError } = jest.requireActual('@/lib/errors/serviceOperationError');
    (obtenerDocumento as jest.Mock).mockRejectedValue(
      new ServiceConflictError('Integridad comprometida: el archivo no coincide con el hash emitido')
    );

    const response = await pedirGet();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/integridad/i);
  });

  test('nunca genera un PDF en vivo: la ruta no conoce al generador', () => {
    // Asercion estatica a proposito: la garantia es que este archivo no tenga
    // ninguna via de regeneracion, no que una llamada concreta no la use.
    const codigo = readFileSync(
      join(process.cwd(), 'src/app/api/solicitudes/[id]/documento/[tipo]/route.ts'),
      'utf8'
    );
    expect(codigo).not.toContain('documentGeneratorService');
    expect(codigo).not.toContain('generate');
  });
});

describe('POST — emite o reintenta segun el estado', () => {
  test('reintenta el archivado de un documento fallido', async () => {
    (ultimoDocumentoDe as jest.Mock).mockResolvedValue({
      ...DOCUMENTO_ARCHIVADO,
      archivoEstado: 'fallido',
    });
    (archivarDocumento as jest.Mock).mockResolvedValue({
      documentoId: 'documento-1',
      archivoEstado: 'archivado',
      sharepointUrl: 'https://x/y.pdf',
      error: null,
    });

    const response = await pedirPost();

    expect(response.status).toBe(200);
    expect(archivarDocumento).toHaveBeenCalledWith('documento-1');
    expect(reemitir).not.toHaveBeenCalled();
    expect((await response.json()).archivoEstado).toBe('archivado');
  });

  test('un documento ya archivado no se reintenta sin pedir reemision', async () => {
    (ultimoDocumentoDe as jest.Mock).mockResolvedValue(DOCUMENTO_ARCHIVADO);

    const response = await pedirPost();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/ya está archivado/i);
    expect(archivarDocumento).not.toHaveBeenCalled();
  });

  test('reemite con motivo y archiva la version nueva', async () => {
    (ultimoDocumentoDe as jest.Mock).mockResolvedValue(DOCUMENTO_ARCHIVADO);
    (reemitir as jest.Mock).mockResolvedValue({
      documentoId: 'documento-2',
      numero: 'DOC-2026-0001',
      version: 2,
      tipo: 'acta_devolucion',
      hashSha256: 'b'.repeat(64),
    });
    (archivarDocumento as jest.Mock).mockResolvedValue({
      documentoId: 'documento-2',
      archivoEstado: 'archivado',
      sharepointUrl: 'https://x/y-v2.pdf',
      error: null,
    });

    const response = await pedirPost({ reemitir: true, motivo: 'El colaborador extravio su copia' });

    expect(response.status).toBe(200);
    expect(reemitir).toHaveBeenCalledWith(
      expect.objectContaining({
        documentoId: 'documento-1',
        motivo: 'El colaborador extravio su copia',
      })
    );
    expect(archivarDocumento).toHaveBeenCalledWith('documento-2');
    expect((await response.json()).version).toBe(2);
  });

  test('rechaza una reemision sin motivo antes de tocar la evidencia', async () => {
    (ultimoDocumentoDe as jest.Mock).mockResolvedValue(DOCUMENTO_ARCHIVADO);

    const response = await pedirPost({ reemitir: true });

    expect(response.status).toBe(400);
    expect(reemitir).not.toHaveBeenCalled();
  });

  test('409 cuando la solicitud nunca emitio el documento: se emite con la transicion', async () => {
    (ultimoDocumentoDe as jest.Mock).mockResolvedValue(null);

    const response = await pedirPost();

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/transición|transicion/i);
  });

  test('exige permiso de escritura sobre solicitudes', async () => {
    const { ForbiddenError } = jest.requireActual('@/lib/auth/guard');
    (requirePermission as jest.Mock).mockRejectedValue(new ForbiddenError('sin permiso'));

    expect((await pedirPost()).status).toBe(403);
    expect(requirePermission).toHaveBeenCalledWith('solicitudes', 'write');
  });
});
