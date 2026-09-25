/**
 * @jest-environment node
 */
// Seguridad de usuarios y registro de accesos (SPEC 2.112).
jest.mock('@/lib/prisma', () => ({
  prisma: {
    systemUser: { findUnique: jest.fn(), count: jest.fn(), update: jest.fn() },
    systemConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    accessLog: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    sesionCerrada: { upsert: jest.fn(), deleteMany: jest.fn() },
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
import { authOptions } from '@/lib/auth';
import { minutosDeBloqueo, datosCliente, cerrarSesion, duracionLegible } from '@/lib/services/accesoService';
import { navegadorLegible } from '@/lib/constants/accesos';
import { inicioDiaChile, rangoDiasChile } from '@/lib/utils/fechas';
import { PUT as editarUsuario } from '@/app/api/usuarios/[id]/route';

const db = prisma as unknown as {
  systemUser: Record<string, jest.Mock>;
  accessLog: Record<string, jest.Mock>;
  sesionCerrada: Record<string, jest.Mock>;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('la sesion revisa la cuenta en cada consulta', () => {
  const jwt = authOptions.callbacks!.jwt!;
  const inicio = Date.now() - 60_000;
  const token = { id: 'u1', role: 'tecnico', sedeId: 's1', expiraEn: Date.now() + 60_000, sesionId: 'ses-1', inicio };
  const cuenta = (extra = {}) => ({
    activo: true,
    rol: 'tecnico',
    sedeId: 's1',
    nombre: 'Ana',
    sesionesDesde: null,
    sesionesCerradas: [],
    ...extra,
  });

  test('una cuenta desactivada queda sin sesion', async () => {
    db.systemUser.findUnique.mockResolvedValue(cuenta({ activo: false }));
    await expect(jwt({ token } as never)).rejects.toThrow(/desactivada/);
  });

  test('una cuenta borrada o inexistente tambien', async () => {
    db.systemUser.findUnique.mockResolvedValue(null);
    await expect(jwt({ token } as never)).rejects.toThrow();
  });

  test('un cambio de rol o de sede aplica de inmediato', async () => {
    db.systemUser.findUnique.mockResolvedValue(cuenta({ rol: 'admin', sedeId: null }));
    const nuevo = await jwt({ token } as never);
    expect(nuevo).toMatchObject({ role: 'admin', sedeId: null });
  });

  test('una sesion cerrada (lista negra) no vuelve a servir', async () => {
    db.systemUser.findUnique.mockResolvedValue(cuenta({ sesionesCerradas: [{ id: 'ses-1' }] }));
    await expect(jwt({ token } as never)).rejects.toThrow(/cerrada/);
    expect(db.systemUser.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ sesionesCerradas: { where: { id: 'ses-1' }, select: { id: true } } }),
      })
    );
  });

  test('una sesion iniciada antes de desactivar no revive al reactivar la cuenta', async () => {
    db.systemUser.findUnique.mockResolvedValue(cuenta({ sesionesDesde: new Date(inicio + 1000) }));
    await expect(jwt({ token } as never)).rejects.toThrow(/cortada/);
  });

  test('una sesion iniciada despues de reactivar si vale', async () => {
    db.systemUser.findUnique.mockResolvedValue(cuenta({ sesionesDesde: new Date(inicio - 1000) }));
    await expect(jwt({ token } as never)).resolves.toMatchObject({ id: 'u1' });
  });

  test('una sesion sin identificador (anterior a la lista negra) pide entrar de nuevo', async () => {
    await expect(jwt({ token: { ...token, sesionId: undefined } } as never)).rejects.toThrow(/vencida/);
  });

  test('al iniciar sesion, el token guarda su identificador y la hora de inicio', async () => {
    const nuevo = await jwt({ token: {}, user: { id: 'u1', role: 'tecnico', sedeId: 's1', expiraEn: 1, sesionId: 'ses-9' } } as never);
    expect(nuevo).toMatchObject({ sesionId: 'ses-9', inicio: expect.any(Number) });
  });

  test('la sesion vence segun la duracion configurada al iniciarla', async () => {
    await expect(jwt({ token: { ...token, expiraEn: Date.now() - 1 } } as never)).rejects.toThrow(/vencida/);
    expect(db.systemUser.findUnique).not.toHaveBeenCalled();
  });
});

describe('bloqueo por intentos, contado en el registro de accesos', () => {
  test('con menos fallos que el maximo, puede intentar', async () => {
    db.accessLog.findFirst.mockResolvedValue(null);
    db.accessLog.findMany.mockResolvedValue([{ createdAt: new Date() }, { createdAt: new Date() }]);
    expect(await minutosDeBloqueo('a@x.cl', 5, 15)).toBe(0);
  });

  test('con el maximo de fallos, queda bloqueado los minutos que faltan', async () => {
    db.accessLog.findFirst.mockResolvedValue(null);
    const hace2min = new Date(Date.now() - 2 * 60_000);
    db.accessLog.findMany.mockResolvedValue(Array(5).fill({ createdAt: hace2min }));
    expect(await minutosDeBloqueo('a@x.cl', 5, 15)).toBe(13);
  });

  test('solo cuenta los fallos despues del ultimo ingreso correcto', async () => {
    const ingreso = new Date(Date.now() - 60_000);
    db.accessLog.findFirst.mockResolvedValue({ createdAt: ingreso });
    db.accessLog.findMany.mockResolvedValue([]);
    await minutosDeBloqueo('a@x.cl', 5, 15);
    expect(db.accessLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdAt: { gte: ingreso } }) })
    );
  });

  test('la direccion de red real es la primera de x-forwarded-for', () => {
    expect(datosCliente({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1', 'user-agent': 'X' })).toEqual({
      ip: '200.1.2.3',
      navegador: 'X',
    });
  });
});

describe('cerrar sesion: lista negra', () => {
  const cliente = { ip: '200.1.2.3', navegador: 'X' };

  test('anota la sesion hasta la hora en que su token habria vencido y borra las vencidas', async () => {
    const expiraEn = Date.now() + 3 * 3600_000;
    db.accessLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 125 * 60_000) });
    await cerrarSesion({ id: 'u1', email: 'a@x.cl', sesionId: 'ses-1', expiraEn }, cliente);
    expect(db.sesionCerrada.upsert).toHaveBeenCalledWith({
      where: { id: 'ses-1' },
      create: { id: 'ses-1', usuarioId: 'u1', expiraEn: new Date(expiraEn) },
      update: {},
    });
    expect(db.sesionCerrada.deleteMany).toHaveBeenCalledWith({ where: { expiraEn: { lt: expect.any(Date) } } });
    expect(db.accessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        resultado: 'cierre_sesion',
        sesionId: 'ses-1',
        ip: '200.1.2.3',
        navegador: 'X',
        detalle: 'Sesión de 2 h 5 min',
      }),
    });
  });

  test('duracion en palabras', () => {
    expect(duracionLegible(30_000)).toBe('menos de 1 min');
    expect(duracionLegible(12 * 60_000)).toBe('12 min');
    expect(duracionLegible(120 * 60_000)).toBe('2 h');
  });
});

describe('textos del registro', () => {
  test('navegador en palabras', () => {
    expect(
      navegadorLegible('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36 Edg/140')
    ).toBe('Edge en Windows');
    expect(navegadorLegible('Mozilla/5.0 (iPhone; CPU iPhone OS 18) Version/18 Safari/604.1')).toBe('Safari en iPhone/iPad');
    expect(navegadorLegible(null)).toBe('-');
  });
});

describe('dias en hora de Chile', () => {
  test('un dia empieza a las 00:00 de Chile (UTC-3 en septiembre)', () => {
    expect(inicioDiaChile('2026-09-25').toISOString()).toBe('2026-09-25T03:00:00.000Z');
  });

  test('en invierno Chile esta en UTC-4', () => {
    expect(inicioDiaChile('2026-06-15').toISOString()).toBe('2026-06-15T04:00:00.000Z');
  });

  test('"hasta" incluye todo ese dia', () => {
    expect(rangoDiasChile('2026-09-25', '2026-09-25')).toEqual({
      gte: new Date('2026-09-25T03:00:00.000Z'),
      lt: new Date('2026-09-26T03:00:00.000Z'),
    });
    expect(rangoDiasChile(null, null)).toBeUndefined();
  });
});

describe('nunca quedarse sin administradores', () => {
  const admin = (id: string) => ({ id, email: `${id}@x.cl`, nombre: id, rol: 'admin', activo: true, sedeId: null });
  const pedir = (body: unknown) =>
    new NextRequest('http://localhost/api/usuarios/x', { method: 'PUT', body: JSON.stringify(body) });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    (requirePermission as jest.Mock).mockResolvedValue({ user: { id: 'yo', email: 'yo@x.cl', role: 'admin' } });
  });

  test('no te puedes desactivar a ti mismo', async () => {
    db.systemUser.findUnique.mockResolvedValue(admin('yo'));
    const res = await editarUsuario(pedir({ activo: false }), ctx('yo'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/tu propia cuenta/);
  });

  test('no te puedes quitar el rol de administrador', async () => {
    db.systemUser.findUnique.mockResolvedValue(admin('yo'));
    const res = await editarUsuario(pedir({ rol: 'tecnico', sedeId: 's1' }), ctx('yo'));
    expect(res.status).toBe(409);
  });

  test('no se desactiva al ultimo administrador activo', async () => {
    db.systemUser.findUnique.mockResolvedValue(admin('otro'));
    db.systemUser.count.mockResolvedValue(0);
    const res = await editarUsuario(pedir({ activo: false }), ctx('otro'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/último administrador/);
  });

  test('con otro administrador activo, se puede desactivar y queda en el registro', async () => {
    db.systemUser.findUnique.mockResolvedValue(admin('otro'));
    db.systemUser.count.mockResolvedValue(1);
    db.systemUser.update.mockResolvedValue({ ...admin('otro'), activo: false });
    const res = await editarUsuario(pedir({ activo: false }), ctx('otro'));
    expect(res.status).toBe(200);
    // Anula para siempre sus sesiones abiertas (SPEC 2.112.5).
    expect(db.systemUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ activo: false, sesionesDesde: expect.any(Date) }) })
    );
    expect(db.accessLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ resultado: 'sesion_revocada', detalle: 'Cuenta desactivada por yo@x.cl' }),
    });
  });
});
