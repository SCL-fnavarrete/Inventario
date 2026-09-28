/** @jest-environment node */
// Auditoria 27-sep-2026, 2.5 y 2.9: reglas de negocio de empleados, sedes
// desactivadas y numero de solicitud.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    employee: { findUnique: jest.fn(), update: jest.fn() },
    assignment: { count: jest.fn() },
    sede: { findUnique: jest.fn() },
  },
}));
jest.mock('@/lib/auth/guard', () => {
  const real = jest.requireActual('@/lib/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});
jest.mock('@/lib/services/auditLogService', () => ({
  auditLogService: { registrarActualizacion: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/guard';
import { PUT as editarEmpleado } from '@/app/api/empleados/[id]/route';
import { exigirSedeActiva } from '@/lib/queries/sedes';
import { generarNumeroSolicitud } from '@/lib/services/numeroSolicitud';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const ADMIN = { user: { id: 'yo', email: 'yo@x.cl', role: 'admin', sedeId: null } };
const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

const pedir = (body: unknown) =>
  new NextRequest('http://localhost/api/empleados/e1', { method: 'PUT', body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: 'e1' }) };
const empleado = (extra = {}) => ({
  id: 'e1',
  rut: null,
  correoEmpresa: null,
  correoPersonal: 'a@x.cl',
  estado: 'activo',
  sedeId: S1,
  fechaIngreso: null,
  fechaTermino: null,
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  (requirePermission as jest.Mock).mockResolvedValue(ADMIN);
  db.employee.update.mockResolvedValue(empleado());
});

describe('editar empleado', () => {
  test('no se traslada de sede si tiene equipos asignados', async () => {
    db.employee.findUnique.mockResolvedValue(empleado());
    db.sede.findUnique.mockResolvedValue({ id: S2, activa: true });
    db.assignment.count.mockResolvedValue(2);
    const res = await editarEmpleado(pedir({ sedeId: S2 }), ctx);
    expect(res.status).toBe(409);
    const cuerpo = await res.json();
    expect(cuerpo.error).toMatch(/2 equipos asignados/);
    expect(cuerpo.details[0].field).toBe('sedeId');
    expect(db.employee.update).not.toHaveBeenCalled();
  });

  test('no se traslada a una sede desactivada', async () => {
    db.employee.findUnique.mockResolvedValue(empleado());
    db.sede.findUnique.mockResolvedValue({ id: S2, activa: false });
    const res = await editarEmpleado(pedir({ sedeId: S2 }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/desactivada/);
  });

  test('sin equipos y a una sede activa, se traslada', async () => {
    db.employee.findUnique.mockResolvedValue(empleado());
    db.sede.findUnique.mockResolvedValue({ id: S2, activa: true });
    db.assignment.count.mockResolvedValue(0);
    const res = await editarEmpleado(pedir({ sedeId: S2 }), ctx);
    expect(res.status).toBe(200);
    expect(db.employee.update.mock.calls[0][0].data.sedeId).toBe(S2);
  });

  test('mandar la misma sede no revisa nada', async () => {
    db.employee.findUnique.mockResolvedValue(empleado());
    const res = await editarEmpleado(pedir({ sedeId: S1 }), ctx);
    expect(res.status).toBe(200);
    expect(db.assignment.count).not.toHaveBeenCalled();
  });

  test('un desvinculado no vuelve a activo desde Editar: va por Onboarding', async () => {
    db.employee.findUnique.mockResolvedValue(empleado({ estado: 'desvinculado' }));
    const res = await editarEmpleado(pedir({ estado: 'activo' }), ctx);
    expect(res.status).toBe(400);
    const cuerpo = await res.json();
    expect(cuerpo.error).toMatch(/Onboarding/);
    expect(cuerpo.redirectTo).toBe('/solicitudes/nueva');
  });

  test('un desvinculado se sigue pudiendo editar sin cambiar su estado', async () => {
    db.employee.findUnique.mockResolvedValue(empleado({ estado: 'desvinculado' }));
    const res = await editarEmpleado(pedir({ cargo: 'Analista', estado: 'desvinculado' }), ctx);
    expect(res.status).toBe(200);
  });

  test('la fecha de término se compara con el ingreso ya guardado', async () => {
    db.employee.findUnique.mockResolvedValue(empleado({ fechaIngreso: new Date('2026-05-10') }));
    const res = await editarEmpleado(pedir({ fechaTermino: '2026-05-01' }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).details[0].field).toBe('fechaTermino');
  });
});

describe('exigirSedeActiva', () => {
  test('rechaza una sede desactivada o que no existe', async () => {
    db.sede.findUnique.mockResolvedValueOnce({ activa: false });
    await expect(exigirSedeActiva(S1)).rejects.toMatchObject({ status: 409 });
    db.sede.findUnique.mockResolvedValueOnce(null);
    await expect(exigirSedeActiva(S1)).rejects.toMatchObject({ status: 409 });
  });

  test('deja pasar una activa', async () => {
    db.sede.findUnique.mockResolvedValueOnce({ activa: true });
    await expect(exigirSedeActiva(S1)).resolves.toBeUndefined();
  });
});

describe('numero de solicitud', () => {
  const tx = (mayor: number | null) => ({
    $queryRaw: jest.fn().mockResolvedValue(mayor === null ? [] : [{ mayor }]),
  });
  const el28 = new Date('2026-09-28T12:00:00');

  test('siguiente al mayor del año, con 4 dígitos', async () => {
    expect(await generarNumeroSolicitud(tx(41), el28)).toBe('WF-2026-0042');
  });

  test('el primero del año es 0001', async () => {
    expect(await generarNumeroSolicitud(tx(0), el28)).toBe('WF-2026-0001');
    expect(await generarNumeroSolicitud(tx(null), el28)).toBe('WF-2026-0001');
  });

  test('pasado 9999 sigue creciendo en vez de repetirse', async () => {
    expect(await generarNumeroSolicitud(tx(9999), el28)).toBe('WF-2026-10000');
    expect(await generarNumeroSolicitud(tx(10000), el28)).toBe('WF-2026-10001');
  });

  test('filtra por el prefijo del año en la base', async () => {
    const t = tx(1);
    await generarNumeroSolicitud(t, el28);
    expect(t.$queryRaw.mock.calls[0]).toContain('WF-2026-%');
  });
});
