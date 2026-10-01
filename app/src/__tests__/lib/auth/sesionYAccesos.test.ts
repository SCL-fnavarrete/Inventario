/**
 * @jest-environment node
 */
// Seguridad de usuarios y registro de accesos (SPEC 2.112).
jest.mock('@/shared/prisma', () => {
  const prisma: Record<string, unknown> = {
    systemUser: { findUnique: jest.fn(), count: jest.fn(), update: jest.fn() },
    systemConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    accessLog: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    sesionCerrada: { upsert: jest.fn(), deleteMany: jest.fn() },
    $executeRaw: jest.fn(),
  };
  // Las transacciones corren sobre el mismo mock (ver PUT /api/usuarios/[id]).
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
jest.mock('@/shared/auth/guard', () => {
  const real = jest.requireActual('@/shared/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});
jest.mock('@/shared/auditoria', () => ({
  auditLogService: { registrarActualizacion: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/shared/prisma';
import { requirePermission } from '@/shared/auth/guard';
import { authOptions } from '@/shared/auth/opciones';
import { minutosDeBloqueo, datosCliente, cerrarSesion, duracionLegible } from '@/shared/auth/accesos';
import { navegadorLegible } from '@/modules/configuracion/etiquetasAccesos';
import { inicioDiaChile, rangoDiasChile } from '@/shared/utilidades/fechas';
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
    sesionVigenteId: 'ses-1',
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

  // SPEC 2.127: una sola sesion por usuario.
  test('solo vale la sesion vigente: otra iniciada despues, o cerrada por un admin, queda fuera', async () => {
    db.systemUser.findUnique.mockResolvedValue(cuenta({ sesionVigenteId: 'ses-2' }));
    await expect(jwt({ token } as never)).rejects.toThrow(/reemplazada/);
    db.systemUser.findUnique.mockResolvedValue(cuenta({ sesionVigenteId: null }));
    await expect(jwt({ token } as never)).rejects.toThrow(/reemplazada/);
  });

  test('al iniciar sesion, el token recuerda si se cerro otra sesion (para el aviso)', async () => {
    const nuevo = await jwt({ token: {}, user: { id: 'u1', role: 'tecnico', sedeId: null, expiraEn: 1, sesionId: 'ses-9', otraSesionCerrada: true } } as never);
    expect(nuevo).toMatchObject({ otraSesionCerrada: true });
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
    expect(await minutosDeBloqueo('ana', '200.1.2.3', 5, 15)).toEqual({ minutos: 0, motivo: null });
  });

  test('con el maximo de fallos, queda bloqueado los minutos que faltan', async () => {
    db.accessLog.findFirst.mockResolvedValue(null);
    const hace2min = new Date(Date.now() - 2 * 60_000);
    db.accessLog.findMany.mockResolvedValue(Array(5).fill({ createdAt: hace2min }));
    expect(await minutosDeBloqueo('ana', '200.1.2.3', 5, 15)).toEqual({ minutos: 13, motivo: 'equipo' });
  });

  test('solo cuenta los fallos despues del ultimo ingreso correcto', async () => {
    const ingreso = new Date(Date.now() - 60_000);
    db.accessLog.findFirst.mockResolvedValue({ createdAt: ingreso });
    db.accessLog.findMany.mockResolvedValue([]);
    await minutosDeBloqueo('ana', '200.1.2.3', 5, 15);
    expect(db.accessLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdAt: { gte: ingreso } }) })
    );
  });

  // Auditoria 27-sep-2026, 2.6: usuario + equipo, con un tope global mas alto.
  describe('por usuario y equipo, con tope global', () => {
    const hace2min = new Date(Date.now() - 2 * 60_000);
    const fallos = (desdeEsteEquipo: number, total: number) =>
      db.accessLog.findMany.mockImplementation(({ where, take }) =>
        Promise.resolve(Array(Math.min(take, where.ip ? desdeEsteEquipo : total)).fill({ createdAt: hace2min }))
      );
    beforeEach(() => db.accessLog.findFirst.mockResolvedValue(null));

    test('los fallos de otro equipo no bloquean al dueño de la cuenta', async () => {
      fallos(0, 5);
      expect((await minutosDeBloqueo('ana', '10.0.0.9', 5, 15)).minutos).toBe(0);
    });

    test('los fallos desde este equipo si lo bloquean', async () => {
      fallos(5, 5);
      expect(await minutosDeBloqueo('ana', '10.0.0.9', 5, 15)).toEqual({ minutos: 13, motivo: 'equipo' });
      expect(db.accessLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ usuarioIngresado: 'ana', ip: '10.0.0.9' }) })
      );
    });

    test('muchos fallos repartidos entre equipos llegan al tope global (4 veces el limite)', async () => {
      fallos(1, 19);
      expect((await minutosDeBloqueo('ana', '10.0.0.9', 5, 15)).minutos).toBe(0);
      fallos(1, 20);
      expect(await minutosDeBloqueo('ana', '10.0.0.9', 5, 15)).toEqual({ minutos: 13, motivo: 'global' });
    });

    test('sin direccion conocida cuenta todos los fallos del usuario', async () => {
      fallos(0, 5);
      expect((await minutosDeBloqueo('ana', null, 5, 15)).minutos).toBe(13);
    });

    test('el intento en curso ya anotado no adelanta el bloqueo', async () => {
      fallos(5, 5);
      expect((await minutosDeBloqueo('ana', '10.0.0.9', 5, 15, 1)).minutos).toBe(0);
      fallos(6, 6);
      expect((await minutosDeBloqueo('ana', '10.0.0.9', 5, 15, 1)).minutos).toBe(13);
    });
  });

  describe('direccion de red: solo detras de un proxy de confianza', () => {
    const cabeceras = { 'x-forwarded-for': '200.1.2.3, 10.0.0.1', 'user-agent': 'X' };
    afterEach(() => {
      delete process.env.VERCEL;
      delete process.env.TRUST_PROXY;
    });

    test('sin proxy conocido la cabecera se ignora: se puede inventar', () => {
      expect(datosCliente(cabeceras)).toEqual({ ip: null, navegador: 'X' });
    });

    test('en Vercel es la primera de x-forwarded-for', () => {
      process.env.VERCEL = '1';
      expect(datosCliente(cabeceras)).toEqual({ ip: '200.1.2.3', navegador: 'X' });
    });

    test('con TRUST_PROXY es la ultima, la que agrego el proxy propio', () => {
      process.env.TRUST_PROXY = 'true';
      expect(datosCliente(cabeceras)).toEqual({ ip: '10.0.0.1', navegador: 'X' });
    });
  });
});

describe('inicio de sesion: el intento se anota antes de revisar la clave', () => {
  const authorize = (authOptions.providers[0] as unknown as {
    options: { authorize: (c: unknown, r: unknown) => Promise<unknown> };
  }).options.authorize;
  const req = { headers: { 'x-forwarded-for': '200.1.2.3', 'user-agent': 'X' } };

  beforeEach(() => {
    process.env.VERCEL = '1';
    db.accessLog.create.mockResolvedValue({ id: 'intento-1' });
    db.accessLog.findFirst.mockResolvedValue(null);
    db.accessLog.findMany.mockResolvedValue([]);
  });
  afterEach(() => {
    delete process.env.VERCEL;
    db.accessLog.create.mockReset();
    db.accessLog.findMany.mockReset();
  });

  test('se anota como fallido antes de buscar la cuenta y luego se corrige', async () => {
    db.systemUser.findUnique.mockResolvedValue(null);
    await expect(authorize({ usuario: 'nadie', password: 'x' }, req)).rejects.toThrow(/incorrectos/);

    expect(db.accessLog.create).toHaveBeenCalledTimes(1);
    expect(db.accessLog.create.mock.calls[0][0].data).toMatchObject({ resultado: 'clave_incorrecta', ip: '200.1.2.3' });
    expect(db.accessLog.create.mock.invocationCallOrder[0]).toBeLessThan(
      db.systemUser.findUnique.mock.invocationCallOrder[0]
    );
    expect(db.accessLog.update).toHaveBeenCalledWith({
      where: { id: 'intento-1' },
      data: expect.objectContaining({ resultado: 'usuario_inexistente' }),
    });
  });

  test('una contraseña de mas de 200 caracteres se rechaza sin buscar la cuenta', async () => {
    await expect(authorize({ usuario: 'ana', password: 'x'.repeat(201) }, req)).rejects.toThrow(/incorrectos/);
    expect(db.systemUser.findUnique).not.toHaveBeenCalled();
    expect(db.accessLog.update).toHaveBeenCalledWith({
      where: { id: 'intento-1' },
      data: expect.objectContaining({ resultado: 'clave_incorrecta', detalle: 'Contraseña demasiado larga' }),
    });
  });

  test('un bloqueo queda anotado en el mismo intento, sin revisar la clave', async () => {
    db.accessLog.findMany.mockImplementation(({ take }) =>
      Promise.resolve(Array(take).fill({ createdAt: new Date() }))
    );
    await expect(authorize({ usuario: 'ana', password: 'x' }, req)).rejects.toThrow(/Demasiados intentos/);
    expect(db.systemUser.findUnique).not.toHaveBeenCalled();
    expect(db.accessLog.update).toHaveBeenCalledWith({
      where: { id: 'intento-1' },
      data: expect.objectContaining({ resultado: 'bloqueado' }),
    });
  });
});

describe('cerrar sesion: lista negra', () => {
  const cliente = { ip: '200.1.2.3', navegador: 'X' };

  test('anota la sesion hasta la hora en que su token habria vencido y borra las vencidas', async () => {
    const expiraEn = Date.now() + 3 * 3600_000;
    db.accessLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 125 * 60_000) });
    await cerrarSesion({ id: 'u1', usuario: 'ana', sesionId: 'ses-1', expiraEn }, cliente);
    expect(db.sesionCerrada.upsert).toHaveBeenCalledWith({
      where: { id: 'ses-1' },
      create: { id: 'ses-1', usuarioId: 'u1', expiraEn: new Date(expiraEn) },
      update: {},
    });
    expect(db.sesionCerrada.deleteMany).toHaveBeenCalledWith({ where: { expiraEn: { lt: expect.any(Date) } } });
    expect(db.accessLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        resultado: 'cierre_sesion',
        sesionId: 'ses-1',
        ip: '200.1.2.3',
        navegador: 'X',
        detalle: 'Sesión de 2 h 5 min',
      }),
    }));
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
  const admin = (id: string) => ({ id, usuario: id, email: null, nombre: id, rol: 'admin', activo: true, sedeId: null });
  const pedir = (body: unknown) =>
    new NextRequest('http://localhost/api/usuarios/x', { method: 'PUT', body: JSON.stringify(body) });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeEach(() => {
    (requirePermission as jest.Mock).mockResolvedValue({ user: { id: 'yo', usuario: 'yo', role: 'admin' } });
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

  // Auditoria 27-sep-2026, 2.9: la revision y el cambio van juntos, con candado.
  test('cuenta a los demas administradores dentro de la transaccion, despues del candado', async () => {
    const dbTx = db as unknown as Record<string, jest.Mock>;
    db.systemUser.findUnique.mockResolvedValue(admin('otro'));
    db.systemUser.count.mockResolvedValue(0);
    await editarUsuario(pedir({ activo: false }), ctx('otro'));

    expect(dbTx.$transaction).toHaveBeenCalledTimes(1);
    const sql = (dbTx.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join('');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(dbTx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.systemUser.count.mock.invocationCallOrder[0]
    );
    expect(db.systemUser.update).not.toHaveBeenCalled();
  });

  test('un cambio que no quita administradores no toma el candado', async () => {
    const dbTx = db as unknown as Record<string, jest.Mock>;
    db.systemUser.findUnique.mockResolvedValue(admin('otro'));
    db.systemUser.update.mockResolvedValue(admin('otro'));
    await editarUsuario(pedir({ nombre: 'Otro Nombre' }), ctx('otro'));
    expect(dbTx.$executeRaw).not.toHaveBeenCalled();
    expect(db.systemUser.update).toHaveBeenCalled();
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
    expect(db.accessLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultado: 'sesion_revocada', detalle: 'Cuenta desactivada por yo' }),
    }));
  });
});
