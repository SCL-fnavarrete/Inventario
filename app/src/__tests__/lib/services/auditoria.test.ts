/**
 * @jest-environment node
 */
// Auditoria unificada (SPEC 2.112.8).
jest.mock('@/shared/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    sede: { findMany: jest.fn() },
    employee: { findMany: jest.fn() },
    asset: { findMany: jest.fn() },
    maintenanceType: { findMany: jest.fn() },
  },
}));
jest.mock('@/shared/auth/guard', () => {
  const real = jest.requireActual('@/shared/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});

import { NextRequest } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { requirePermission } from '@/shared/auth/guard';
import { cambiosLegibles, consultarAuditoria, contiene, valorLegible } from '@/modules/configuracion/auditoria';
import { GET } from '@/app/api/auditoria/route';

const db = prisma as unknown as Record<string, jest.Mock & Record<string, jest.Mock>>;

/** Parametros de la consulta: $queryRaw se llama como plantilla (textos, ...valores). */
const valoresDe = (llamada: unknown[]) =>
  llamada.slice(1).flatMap((v) => ((v as Prisma.Sql)?.values !== undefined ? (v as Prisma.Sql).values : [v]));

beforeEach(() => {
  jest.clearAllMocks();
  (requirePermission as jest.Mock).mockResolvedValue({ user: { id: 'yo', role: 'admin' } });
  for (const t of ['sede', 'employee', 'asset', 'maintenanceType']) db[t].findMany.mockResolvedValue([]);
});

describe('detalle legible: solo lo que cambió', () => {
  test('al editar, solo los campos distintos, con nombres en vez de códigos', () => {
    const nombres = new Map([['s1', 'Santiago'], ['s2', 'Concepción']]);
    const cambios = cambiosLegibles(
      { nombre: 'Ana', rol: 'tecnico', activo: true, sedeId: 's1' },
      { nombre: 'Ana', rol: 'admin', activo: true, sedeId: 's2' },
      'usuario',
      nombres
    );
    expect(cambios).toEqual([
      { campo: 'Rol', antes: 'Técnico', despues: 'Administrador' },
      { campo: 'Sede', antes: 'Santiago', despues: 'Concepción' },
    ]);
  });

  test('al crear, muestra los datos (sin "antes")', () => {
    expect(cambiosLegibles(null, { nombre: 'Tablet', requiereImei: true }, 'categoria')).toEqual([
      { campo: 'Nombre', antes: null, despues: 'Tablet' },
      { campo: 'Pide IMEI', antes: null, despues: 'Sí' },
    ]);
  });

  test('oculta datos internos y traduce estados según el módulo', () => {
    const cambios = cambiosLegibles({ estado: 'disponible' }, { estado: 'asignado', indice: 3, guideId: 'g' }, 'activo');
    expect(cambios).toEqual([{ campo: 'Estado', antes: 'Disponible', despues: 'Asignado' }]);
    expect(valorLegible('estado', 'recibida_parcial', 'guia_despacho')).toBe('Recibido con faltantes');
  });

  test('las fechas se muestran en hora de Chile', () => {
    expect(valorLegible('fecha', '2026-09-25T15:56:32.820Z', 'activo')).toMatch(/25-09-2026,? 12:56/);
    expect(valorLegible('fechaProgramada', '2026-09-24T00:00:00.000Z', 'mantencion')).toMatch(/2[34]-09-2026$/);
  });
});

describe('una sola consulta con páginas exactas', () => {
  test('pagina en la base y devuelve el total real', async () => {
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 1194 }]);
    const r = await consultarAuditoria({ page: 3, limit: 20 });
    expect(r.total).toBe(1194);
    expect(valoresDe(db.$queryRaw.mock.calls[0])).toEqual(expect.arrayContaining([20, 40]));
  });

  test('filtros de módulo, usuario, texto y días de Chile', async () => {
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);
    const gte = new Date('2026-09-25T03:00:00Z');
    const lt = new Date('2026-09-26T03:00:00Z');
    await consultarAuditoria({ modulo: 'sede', usuario: 'ana', search: 'QA', rango: { gte, lt }, page: 1, limit: 20 });
    expect(valoresDe(db.$queryRaw.mock.calls[0])).toEqual(expect.arrayContaining(['sede', '%ana%', '%QA%', gte, lt]));
  });

  test('traduce la acción y arma el enlace al registro', async () => {
    db.$queryRaw
      .mockResolvedValueOnce([
        {
          fuente: 'workflow_transition', id: 't1', modulo: 'solicitud', entidad_id: 'r1', accion: 'gestion_ti>equipos_entregados',
          descripcion: 'Cambio de estado', usuario_email: 'a@x.cl', usuario_nombre: 'Ana', datos_anteriores: null,
          datos_nuevos: null, created_at: new Date(), contexto: 'SOL-0001',
        },
        {
          fuente: 'auditlog', id: 'a1', modulo: 'compra', entidad_id: 'c1', accion: 'eliminar', descripcion: 'Compra eliminada',
          usuario_email: 'a@x.cl', usuario_nombre: null, datos_anteriores: { numeroFactura: '12' }, datos_nuevos: null,
          created_at: new Date(), contexto: null,
        },
      ])
      .mockResolvedValueOnce([{ total: 2 }]);
    const { data } = await consultarAuditoria({ page: 1, limit: 20 });
    expect(data[0]).toMatchObject({ accion: 'Gestión TI → Equipos Entregados', usuario: 'Ana', enlace: '/solicitudes/r1' });
    // Un registro eliminado no tiene a donde enlazar.
    expect(data[1]).toMatchObject({ accion: 'Eliminó', usuario: 'a@x.cl', enlace: null });
  });

  test('un módulo desconocido -> 400', async () => {
    const res = await GET(new NextRequest('http://localhost/api/auditoria?modulo=no_existe'));
    expect(res.status).toBe(400);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});

// Auditoria 28-sep-2026: lo que escribe el usuario no actua como comodin.
test('la búsqueda escapa %, _ y la barra invertida', () => {
  expect(contiene('ana')).toBe('%ana%');
  expect(contiene('100%')).toBe('%100\\%%');
  expect(contiene('a_b')).toBe('%a\\_b%');
  expect(contiene('c:\\x')).toBe('%c:\\\\x%');
});
