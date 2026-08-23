/** @jest-environment node */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({ user: { id: 'user-1', role: 'tecnico' } }),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: { assignment: { findUnique: jest.fn() } },
}));
jest.mock('@/lib/services/documentEmissionService', () => ({
  documentoArchivadoDeAsignacion: jest.fn(async () => null),
  obtenerDocumento: jest.fn(),
}));

import { GET } from '@/app/api/asignaciones/[id]/acta/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { FIRMA_VALIDA } from '@/test-utils/signature';
import {
  documentoArchivadoDeAsignacion,
  obtenerDocumento,
} from '@/lib/services/documentEmissionService';

beforeEach(() => {
  (documentoArchivadoDeAsignacion as jest.Mock).mockResolvedValue(null);
});

/**
 * El acta declara qué evidencia respalda lo que afirma.
 *
 * Exigir firma con un 409 dejaba sin acta a todo el parque cargado antes del
 * control: ninguna de esas asignaciones tiene firma, así que la función
 * desaparecía para los datos existentes. Y al revés, cuando la firma sí estaba
 * el PDF seguía dibujando una línea vacía sobre "Firma Colaborador", de modo
 * que un auditor veía un acta sin firmar aunque la evidencia existiera.
 *
 * Ahora el documento dice la verdad en los dos casos, y la cabecera
 * `X-Evidencia-Oficial` permite saberlo sin abrir el PDF.
 */
function assignmentBase(firmada: boolean) {
  return {
    id: 'assignment-1',
    employeeId: 'employee-1',
    fechaEntrega: new Date('2026-08-01T00:00:00.000Z'),
    fechaDevolucion: null,
    lugarEntrega: 'Santiago',
    entregadoPor: 'Técnico TI',
    tipoMovimiento: 'ingreso',
    motivo: null,
    recibidoPor: null,
    estadoDevolucion: null,
    observacionesDevolucion: null,
    firmaEmpleadoEntrega: firmada ? FIRMA_VALIDA : null,
    firmaEmpleadoEntregaEn: firmada ? new Date('2026-08-01T12:00:00.000Z') : null,
    firmaEmpleadoDevolucion: null,
    firmaEmpleadoDevolucionEn: null,
    asset: {
      marca: 'Lenovo', modelo: 'T14', numeroSerie: 'ABC123',
      procesador: null, ram: null, discoDuro: null, sistemaOperativo: null,
      imei: null, numeroTelefono: null, tipoPlan: null,
      categoria: { nombre: 'Notebook', tipoDevolucion: 'notebook' },
    },
    employee: {
      id: 'employee-1', rut: '11.111.111-1', nombres: 'Ada', apellidoPaterno: 'Lovelace',
      apellidoMaterno: null, correo: 'ada@sclconsultores.com', cargo: null, jefatura: null, ubicacion: null,
    },
  };
}

function pedirActa() {
  return GET(
    new NextRequest('http://localhost/api/asignaciones/assignment-1/acta?tipo=entrega'),
    { params: Promise.resolve({ id: 'assignment-1' }) }
  );
}

describe('GET /api/asignaciones/[id]/acta — evidencia oficial', () => {
  test('emite el acta de una asignación histórica y la marca como registro sin evidencia', async () => {
    (prisma.assignment.findUnique as jest.Mock).mockResolvedValue(assignmentBase(false));

    const response = await pedirActa();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('x-evidencia-oficial')).toBe('ausente');
  });

  test('declara la evidencia presente cuando la asignación está firmada', async () => {
    (prisma.assignment.findUnique as jest.Mock).mockResolvedValue(assignmentBase(true));

    const response = await pedirActa();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-evidencia-oficial')).toBe('presente');
  });

  test('dibuja la firma guardada en vez de una línea en blanco', async () => {
    (prisma.assignment.findUnique as jest.Mock).mockResolvedValue(assignmentBase(true));
    const conFirma = Buffer.from(await (await pedirActa()).arrayBuffer());

    (prisma.assignment.findUnique as jest.Mock).mockResolvedValue(assignmentBase(false));
    const sinFirma = Buffer.from(await (await pedirActa()).arrayBuffer());

    // La imagen embebida es la única diferencia de peso entre los dos actos.
    expect(conFirma.length).toBeGreaterThan(sinFirma.length + 500);
  });

  /**
   * Task 6: cuando existe el documento inmutable, es el que manda. El acta
   * dibujada al vuelo sigue existiendo solo para el parque anterior al
   * control, y ahora dice de dónde viene.
   */
  test('entrega el documento archivado cuando la asignación tiene evidencia emitida', async () => {
    (prisma.assignment.findUnique as jest.Mock).mockResolvedValue(assignmentBase(true));
    (documentoArchivadoDeAsignacion as jest.Mock).mockResolvedValue({
      id: 'documento-1', numero: 'DOC-2026-0001', version: 1, tipo: 'comprobante_entrega',
    });
    (obtenerDocumento as jest.Mock).mockResolvedValue({
      contenido: Buffer.from('%PDF-archivado'),
      numero: 'DOC-2026-0001', version: 1, tipo: 'comprobante_entrega',
      emitidoEn: new Date('2026-03-04T12:34:56.000Z'),
    });

    const response = await pedirActa();

    expect(response.status).toBe(200);
    expect(response.headers.get('x-documento-origen')).toBe('emitido');
    expect(response.headers.get('x-evidencia-oficial')).toBe('presente');
    expect(response.headers.get('content-disposition')).toContain('DOC-2026-0001_v1.pdf');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('%PDF-archivado');
  });

  test('marca como no oficial el acta que dibuja para el parque histórico', async () => {
    (prisma.assignment.findUnique as jest.Mock).mockResolvedValue(assignmentBase(false));

    const response = await pedirActa();

    expect(response.headers.get('x-documento-origen')).toBe('historico-no-oficial');
  });

  test('sigue respondiendo 404 cuando la asignación no existe', async () => {
    (prisma.assignment.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await pedirActa();

    expect(response.status).toBe(404);
  });
});
