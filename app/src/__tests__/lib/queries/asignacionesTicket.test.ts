// Equipos de un ticket (SPEC 2.84, 2.87, 2.90, 2.92): pares del cambio,
// devolucion en el ticket, recuperaciones posteriores y actas disponibles.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    assignment: { findMany: jest.fn() },
    workflowRequest: { findMany: jest.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  asignacionesDelTicket,
  desvinculacionesConActa,
  devueltaEnTicket,
  devueltasDespues,
  paresDeCambio,
} from '@/lib/queries/asignacionesTicket';

const assignmentFindMany = prisma.assignment.findMany as jest.Mock;
const ticketFindMany = prisma.workflowRequest.findMany as jest.Mock;

beforeEach(() => {
  assignmentFindMany.mockReset();
  ticketFindMany.mockReset();
});

describe('paresDeCambio', () => {
  const a = (id: string) => ({ id });

  test('arma un par por equipo en el orden del ticket [viejo, nuevo, viejo, nuevo]', () => {
    const pares = paresDeCambio(['v1', 'n1', 'v2', 'n2'], [a('n2'), a('v1'), a('n1'), a('v2')]);
    expect(pares).toEqual([
      { anterior: { id: 'v1' }, nuevo: { id: 'n1' } },
      { anterior: { id: 'v2' }, nuevo: { id: 'n2' } },
    ]);
  });

  test('un ticket antiguo de un solo par sigue funcionando', () => {
    expect(paresDeCambio(['v', 'n'], [a('v'), a('n')])).toEqual([
      { anterior: { id: 'v' }, nuevo: { id: 'n' } },
    ]);
  });

  test('una asignacion que no se encontro queda en null', () => {
    expect(paresDeCambio(['v', 'n'], [a('v')])).toEqual([{ anterior: { id: 'v' }, nuevo: null }]);
  });
});

describe('devueltaEnTicket', () => {
  const sinRecuperar = new Map();

  test('buen estado y dañado cuentan como devueltos en el ticket', () => {
    expect(devueltaEnTicket({ id: '1', estadoDevolucion: 'ok' }, sinRecuperar)).toBe(true);
    expect(devueltaEnTicket({ id: '1', estadoDevolucion: 'danado' }, sinRecuperar)).toBe(true);
  });

  test('"No devuelto" o sin calificar no cuentan', () => {
    expect(devueltaEnTicket({ id: '1', estadoDevolucion: 'no_devuelto' }, sinRecuperar)).toBe(false);
    expect(devueltaEnTicket({ id: '1', estadoDevolucion: null }, sinRecuperar)).toBe(false);
  });

  test('un equipo recuperado en un ticket posterior no se devolvio en este', () => {
    const recuperadas = new Map([['1', { id: 't2', numero: 'WF-2026-0002' }]]);
    expect(devueltaEnTicket({ id: '1', estadoDevolucion: 'ok' }, recuperadas)).toBe(false);
  });
});

describe('asignacionesDelTicket', () => {
  test('sin assignmentIds no consulta la base', async () => {
    expect(await asignacionesDelTicket([])).toEqual([]);
    expect(assignmentFindMany).not.toHaveBeenCalled();
  });

  test('devuelve las asignaciones en el orden del ticket y omite las que no existen', async () => {
    assignmentFindMany.mockResolvedValue([{ id: 'b' }, { id: 'a' }]);
    expect(await asignacionesDelTicket(['a', 'x', 'b'])).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});

describe('devueltasDespues', () => {
  const ticket = { id: 't1', createdAt: new Date('2026-09-01'), assignmentIds: ['a1', 'a2'] };

  test('sin assignmentIds no consulta la base', async () => {
    const mapa = await devueltasDespues({ ...ticket, assignmentIds: [] });
    expect(mapa.size).toBe(0);
    expect(ticketFindMany).not.toHaveBeenCalled();
  });

  test('marca cada asignacion con el primer ticket posterior que la incluye', async () => {
    ticketFindMany.mockResolvedValue([
      { id: 't2', numero: 'WF-2', assignmentIds: ['a1', 'otra'] },
      { id: 't3', numero: 'WF-3', assignmentIds: ['a1', 'a2'] },
    ]);
    const mapa = await devueltasDespues(ticket);
    expect(mapa.get('a1')).toEqual({ id: 't2', numero: 'WF-2' });
    expect(mapa.get('a2')).toEqual({ id: 't3', numero: 'WF-3' });
    expect(mapa.has('otra')).toBe(false);
  });
});

describe('desvinculacionesConActa', () => {
  const fecha = new Date('2026-09-01');

  test('solo tiene acta la desvinculacion con algo devuelto en el ticket', async () => {
    assignmentFindMany.mockResolvedValue([
      { id: 'devuelta', estadoDevolucion: 'ok' },
      { id: 'pendiente', estadoDevolucion: 'no_devuelto' },
      { id: 'recuperada', estadoDevolucion: 'ok' },
    ]);
    // La asignacion "recuperada" aparece en un ticket posterior.
    ticketFindMany.mockImplementation(({ where }: { where: { id: { not: string } } }) =>
      Promise.resolve(
        where.id.not === 'conRecuperacion'
          ? [{ id: 'posterior', numero: 'WF-9', assignmentIds: ['recuperada'] }]
          : []
      )
    );
    const conActa = await desvinculacionesConActa([
      { id: 'conDevolucion', tipo: 'offboarding', createdAt: fecha, assignmentIds: ['devuelta'] },
      { id: 'sinDevolucion', tipo: 'offboarding', createdAt: fecha, assignmentIds: ['pendiente'] },
      { id: 'conRecuperacion', tipo: 'offboarding', createdAt: fecha, assignmentIds: ['recuperada'] },
      { id: 'antiguo', tipo: 'offboarding', createdAt: fecha, assignmentIds: [] },
      { id: 'onboarding', tipo: 'onboarding', createdAt: fecha, assignmentIds: ['devuelta'] },
    ]);
    expect([...conActa].sort()).toEqual(['antiguo', 'conDevolucion']);
  });
});
