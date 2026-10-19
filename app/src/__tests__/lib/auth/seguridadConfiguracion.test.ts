/**
 * @jest-environment node
 */
// Configuracion parte 3: seguridad y datos correctos (SPEC 2.112.6).
jest.mock('@/shared/prisma', () => {
  const prisma: Record<string, unknown> = {
    systemUser: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), create: jest.fn() },
    systemConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    accessLog: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    sede: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() },
    // Una sola sesion por usuario (SPEC 2.127).
    sesionCerrada: { findUnique: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([{ sesion_vigente_id: null }]),
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
  auditLogService: { registrarActualizacion: jest.fn(), registrarCreacion: jest.fn() },
}));
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hash-nuevo'),
  __esModule: true,
  default: { compare: jest.fn(), hash: jest.fn().mockResolvedValue('hash-nuevo') },
}));

import { NextRequest } from 'next/server';
import { compare } from 'bcryptjs';
import { prisma } from '@/shared/prisma';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { authOptions } from '@/shared/auth/opciones';
import { limpiarRegistroAntiguo } from '@/shared/auth/accesos';
import { ipLegible } from '@/modules/configuracion/etiquetasAccesos';
import { crearSedeSchema, editarSedeSchema } from '@/modules/configuracion/validacionesSede';
import { usoSedeEnPalabras } from '@/modules/configuracion/consultasSedes';
import { crearUsuarioSchema, editarUsuarioSchema } from '@/modules/configuracion/validacionesUsuario';
import { LIMITES_SEGURIDAD, validarParametros } from '@/modules/configuracion/validacionesParametros';
import { PUT as editarUsuario } from '@/app/api/usuarios/[id]/route';
import { POST as crearUsuario } from '@/app/api/usuarios/route';
import { PATCH as editarSede } from '@/app/api/sedes/[id]/route';
import { POST as cerrarSesionDe } from '@/app/api/usuarios/[id]/cerrar-sesion/route';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const CLAVE = 'Secreta#2026abc';

beforeEach(() => {
  jest.clearAllMocks();
  db.systemConfig.findUnique.mockResolvedValue(null);
  (requirePermission as jest.Mock).mockResolvedValue({ user: { id: 'yo', usuario: 'yo', role: 'admin' } });
});

const pedir = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/x', { method, body: typeof body === 'string' ? body : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

// SPEC 2.127: un administrador cierra la sesion de un usuario.
describe('cerrar la sesión de un usuario', () => {
  const cerrar = (id: string) => cerrarSesionDe(pedir('POST', {}), ctx(id));

  test('la cuenta queda sin sesión vigente y, si tenía una abierta, queda en el registro', async () => {
    db.systemUser.findUnique.mockResolvedValue({ usuario: 'otro', sesionesDesde: null });
    (db.$queryRaw as unknown as jest.Mock).mockResolvedValueOnce([{ sesion_vigente_id: 'ses-1' }]);
    db.accessLog.findFirst.mockResolvedValueOnce({ createdAt: new Date() });
    const res = await cerrar('otro');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ teniaSesion: true });
    expect((db.$queryRaw as unknown as jest.Mock).mock.calls[0].slice(1)).toEqual([null, 'otro']);
    expect(db.accessLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultado: 'sesion_revocada', sesionId: 'ses-1', detalle: 'Sesión cerrada por yo' }),
    }));
  });

  test('sin sesión abierta responde igual, sin anotar nada', async () => {
    db.systemUser.findUnique.mockResolvedValue({ usuario: 'otro', sesionesDesde: null });
    const res = await cerrar('otro');
    expect(await res.json()).toEqual({ teniaSesion: false });
    expect(db.accessLog.create).not.toHaveBeenCalled();
  });

  test('la propia sesión no se cierra desde aquí', async () => {
    const res = await cerrar('yo');
    expect(res.status).toBe(409);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('reglas de datos (Zod)', () => {
  test('sede: el código queda en mayúsculas y sin espacios', () => {
    expect(crearSedeSchema.parse({ codigo: ' stgo ', nombre: ' Santiago ' })).toEqual({ codigo: 'STGO', nombre: 'Santiago' });
  });

  test('sede: lo que la usa, en palabras (SPEC 2.170); despachos de salida y llegada se suman', () => {
    const cero = { assets: 0, empleados: 0, usuarios: 0, lineas: 0, kitItems: 0, guias: 0, guiasDestino: 0, compras: 0, repartosKit: 0, solicitudes: 0 };
    expect(usoSedeEnPalabras(cero)).toBe('');
    expect(usoSedeEnPalabras({ ...cero, empleados: 1 })).toBe('1 persona');
    expect(usoSedeEnPalabras({ ...cero, assets: 3, guias: 1, guiasDestino: 1, solicitudes: 2 })).toBe(
      '3 equipos, 2 despachos y 2 solicitudes'
    );
  });

  test('sede: ya no se activa ni desactiva; editar pide el nombre', () => {
    expect(editarSedeSchema.safeParse({ activa: false }).success).toBe(false);
    expect(crearSedeSchema.parse({ codigo: 'x', nombre: 'X', activa: false })).toEqual({ codigo: 'X', nombre: 'X' });
  });

  test('sede: nombre vacío o que no es texto se rechaza', () => {
    expect(editarSedeSchema.safeParse({ nombre: '   ' }).success).toBe(false);
    expect(crearSedeSchema.safeParse({ codigo: 123, nombre: 456 }).success).toBe(false);
  });

  // SPEC 2.122: se entra con el usuario; el correo es opcional.
  test('usuario: obligatorio, en minúsculas y solo con caracteres permitidos', () => {
    expect(crearUsuarioSchema.parse({ usuario: ' JSoto ', nombre: 'Ana', password: CLAVE }).usuario).toBe('jsoto');
    for (const malo of ['', 'ab', 'j soto', 'jsoto@scl', 'ñandu', 'x'.repeat(31)]) {
      const r = crearUsuarioSchema.safeParse({ usuario: malo, nombre: 'A', password: CLAVE });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].path).toEqual(['usuario']);
    }
    expect(crearUsuarioSchema.safeParse({ nombre: 'A', password: CLAVE }).success).toBe(false);
    expect(crearUsuarioSchema.safeParse({ usuario: 'j.soto_2-b', nombre: 'A', password: CLAVE }).success).toBe(true);
  });

  test('usuario: el correo es opcional; si se escribe debe ser válido, y vacío queda sin correo', () => {
    const sinCorreo = crearUsuarioSchema.parse({ usuario: 'ana', nombre: 'Ana', password: CLAVE });
    expect(sinCorreo.email).toBeUndefined();
    expect(crearUsuarioSchema.parse({ usuario: 'ana', email: '', nombre: 'Ana', password: CLAVE }).email).toBeNull();
    expect(editarUsuarioSchema.parse({ email: '  ' }).email).toBeNull();
    const malo = crearUsuarioSchema.safeParse({ usuario: 'ana', email: 'esto-no-es-correo', nombre: 'A', password: CLAVE });
    expect(malo.error?.issues[0].path).toEqual(['email']);
    expect(crearUsuarioSchema.parse({ usuario: 'ana', email: ' Ana@SCL.cl ', nombre: 'Ana', password: CLAVE }).email).toBe('ana@scl.cl');
  });

  test('usuario: contraseña débil se rechaza; vacía al editar significa mantenerla', () => {
    expect(crearUsuarioSchema.safeParse({ usuario: 'ana', nombre: 'A', password: 'corta' }).success).toBe(false);
    expect(editarUsuarioSchema.parse({ password: '' }).password).toBeUndefined();
    expect(editarUsuarioSchema.safeParse({ password: 'corta' }).success).toBe(false);
  });

  test('usuario: nombre en blanco al editar se rechaza', () => {
    expect(editarUsuarioSchema.safeParse({ nombre: '   ' }).success).toBe(false);
  });

  test('seguridad: sin bloqueo por equipo (SPEC 2.170), solo los tres valores de la cuenta', () => {
    expect(Object.keys(LIMITES_SEGURIDAD)).toEqual(['duracionSesionHoras', 'maxIntentosLogin', 'minutosBloqueoLogin']);
    expect(validarParametros({ maxIntentosLogin: 0 })).toHaveProperty('maxIntentosLogin');
  });
});

describe('errores de quien envía no son 500', () => {
  test('cuerpo que no es JSON -> 400', async () => {
    const res = handleApiError(new SyntaxError('Unexpected token'));
    expect(res.status).toBe(400);
  });

  test('crear usuario con cuerpo roto -> 400', async () => {
    const res = await crearUsuario(pedir('POST', '{roto'));
    expect(res.status).toBe(400);
  });
});

describe('usuarios y sedes', () => {
  test('no se crea un técnico en una sede que no existe', async () => {
    db.systemUser.findUnique.mockResolvedValue(null);
    db.sede.findUnique.mockResolvedValue(null);
    const res = await crearUsuario(pedir('POST', { usuario: 'ana', nombre: 'A', password: CLAVE, rol: 'tecnico', sedeId: 's9' }));
    expect(res.status).toBe(409);
    expect((await res.json()).details[0].field).toBe('sedeId');
    expect(db.systemUser.create).not.toHaveBeenCalled();
  });

  test('el usuario no se repite entre cuentas (SPEC 2.122)', async () => {
    db.systemUser.findFirst.mockResolvedValueOnce({ id: 'otra' });
    const res = await crearUsuario(pedir('POST', { usuario: 'JSoto', nombre: 'A', password: CLAVE, rol: 'admin' }));
    expect(res.status).toBe(409);
    expect((await res.json()).details[0].field).toBe('usuario');
    expect(db.systemUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ usuario: 'jsoto' }) }));
    expect(db.systemUser.create).not.toHaveBeenCalled();
  });

  test('el usuario no se puede cambiar una vez creado (SPEC 2.122)', async () => {
    const res = await editarUsuario(pedir('PUT', { usuario: 'otro.nombre' }), ctx('u1'));
    expect(res.status).toBe(400);
    expect((await res.json()).details[0].field).toBe('usuario');
    expect(db.systemUser.update).not.toHaveBeenCalled();
    expect(editarUsuarioSchema.safeParse({ nombre: 'Otro' }).success).toBe(true);
  });

  test('dos sedes no pueden llamarse igual', async () => {
    db.sede.findUnique.mockResolvedValue({ id: 's1', nombre: 'Conce' });
    db.sede.findFirst.mockResolvedValue({ id: 's2' });
    const res = await editarSede(pedir('PATCH', { nombre: 'santiago' }), ctx('s1'));
    expect(res.status).toBe(409);
    expect(db.sede.update).not.toHaveBeenCalled();
  });
});

describe('cambiar la contraseña cierra las sesiones', () => {
  const tecnico = { id: 'otro', usuario: 'otro', email: null, nombre: 'Otro', rol: 'tecnico', activo: true, sedeId: 's1' };

  test('la contraseña de otro usuario: se anulan sus sesiones y queda en el registro', async () => {
    db.systemUser.findUnique.mockResolvedValue(tecnico);
    db.systemUser.update.mockResolvedValue(tecnico);
    const res = await editarUsuario(pedir('PUT', { password: CLAVE }), ctx('otro'));
    expect(res.status).toBe(200);
    expect(db.systemUser.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sesionesDesde: expect.any(Date) }) })
    );
    expect(db.accessLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ resultado: 'sesion_revocada', detalle: 'Contraseña cambiada por yo' }),
    }));
  });

  test('la propia contraseña: no se corta la sesión de quien la cambia', async () => {
    db.systemUser.findUnique.mockResolvedValue({ ...tecnico, id: 'yo', rol: 'admin', sedeId: null });
    db.systemUser.update.mockResolvedValue({ ...tecnico, id: 'yo' });
    await editarUsuario(pedir('PUT', { password: CLAVE }), ctx('yo'));
    expect(db.systemUser.update.mock.calls[0][0].data.sesionesDesde).toBeUndefined();
    expect(db.accessLog.create).not.toHaveBeenCalled();
  });
});

describe('inicio de sesión', () => {
  const authorize = (authOptions.providers[0] as unknown as { options: { authorize: (c: unknown, r: unknown) => Promise<unknown> } })
    .options.authorize;
  const req = { headers: { 'x-forwarded-for': '200.1.2.3', 'user-agent': 'X' } };

  beforeEach(() => {
    // La direccion de x-forwarded-for solo se cree detras de un proxy conocido.
    process.env.VERCEL = '1';
    db.accessLog.findFirst.mockResolvedValue(null);
    db.accessLog.findMany.mockResolvedValue([]);
  });
  afterEach(() => {
    delete process.env.VERCEL;
  });

  test('con un usuario que no existe igual se compara una contraseña (mismo tiempo)', async () => {
    db.systemUser.findUnique.mockResolvedValue(null);
    await expect(authorize({ usuario: 'nadie', password: 'x' }, req)).rejects.toThrow('Usuario o contraseña incorrectos');
    expect(compare).toHaveBeenCalledWith('x', expect.stringMatching(/^\$2b\$12\$/));
  });

  test('busca la cuenta por usuario, sin importar mayúsculas ni espacios (SPEC 2.122)', async () => {
    db.systemUser.findUnique.mockResolvedValue(null);
    await expect(authorize({ usuario: ' JSoto ', password: 'x' }, req)).rejects.toThrow(/incorrectos/);
    expect(db.systemUser.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { usuario: 'jsoto' } }));
    expect(db.accessLog.create.mock.calls[0][0].data.usuarioIngresado).toBe('jsoto');
  });

  // SPEC 2.127: una sola sesion por usuario, gana la ultima.
  describe('una sola sesión por usuario', () => {
    const cuenta = { id: 'u1', usuario: 'ana', nombre: 'Ana', rol: 'admin', activo: true, passwordHash: 'h', sedeId: null, sesionesDesde: null, sede: null };
    const entrar = async () => {
      db.systemUser.findUnique.mockResolvedValue(cuenta);
      (compare as jest.Mock).mockResolvedValue(true);
      db.accessLog.create.mockResolvedValue({ id: 'intento-1' });
      return (await authorize({ usuario: 'ana', password: CLAVE }, req)) as { sesionId: string; otraSesionCerrada: boolean };
    };
    const anulada = () =>
      db.accessLog.create.mock.calls.find((c) => c[0].data.resultado === 'sesion_revocada')?.[0].data;
    // Que lo simulado aqui no pase a los demas tests.
    afterEach(() => {
      db.accessLog.create.mockReset();
      db.accessLog.findFirst.mockReset();
    });

    test('la nueva sesión pasa a ser la vigente', async () => {
      const u = await entrar();
      const sql = (db.$queryRaw as unknown as jest.Mock).mock.calls[0];
      expect(sql[0].join('')).toContain('sesion_vigente_id');
      expect(sql.slice(1)).toEqual([u.sesionId, 'u1']);
    });

    test('si otra seguía abierta, queda anulada en el registro y se avisa', async () => {
      (db.$queryRaw as unknown as jest.Mock).mockResolvedValueOnce([{ sesion_vigente_id: 'ses-vieja' }]);
      db.accessLog.findFirst.mockImplementation(({ where }) =>
        Promise.resolve(where.sesionId === 'ses-vieja' ? { createdAt: new Date(Date.now() - 3600_000) } : null)
      );
      const u = await entrar();
      expect(u.otraSesionCerrada).toBe(true);
      expect(anulada()).toMatchObject({ sesionId: 'ses-vieja', usuarioIngresado: 'ana', detalle: 'Se inició sesión en otro equipo' });
    });

    test('si la anterior ya se había cerrado o vencido, no se anota nada', async () => {
      (db.$queryRaw as unknown as jest.Mock).mockResolvedValueOnce([{ sesion_vigente_id: 'ses-vieja' }]);
      db.sesionCerrada.findUnique.mockResolvedValueOnce({ id: 'ses-vieja' });
      db.accessLog.findFirst.mockResolvedValue({ createdAt: new Date() });
      expect((await entrar()).otraSesionCerrada).toBe(false);
      (db.$queryRaw as unknown as jest.Mock).mockResolvedValueOnce([{ sesion_vigente_id: 'ses-vieja' }]);
      db.accessLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 48 * 3600_000) });
      expect((await entrar()).otraSesionCerrada).toBe(false);
      expect(anulada()).toBeUndefined();
    });
  });

  // SPEC 2.170: sin bloqueo por equipo. Los fallos de otros usuarios desde la
  // misma dirección no bloquean a esta cuenta; sigue el bloqueo por cuenta.
  test('muchos fallos de otros usuarios desde la misma dirección no bloquean esta cuenta', async () => {
    db.accessLog.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.ip && !where.usuarioIngresado ? Array(50).fill({ createdAt: new Date() }) : [])
    );
    db.systemUser.findUnique.mockResolvedValue(null);
    await expect(authorize({ usuario: 'otro', password: 'x' }, req)).rejects.toThrow(/incorrectos/);
    expect(db.systemUser.findUnique).toHaveBeenCalled();
  });

  test('los fallos de la misma cuenta sí la bloquean', async () => {
    db.accessLog.findMany.mockImplementation(({ where }) =>
      Promise.resolve(where.usuarioIngresado ? Array(6).fill({ createdAt: new Date() }) : [])
    );
    await expect(authorize({ usuario: 'otro', password: 'x' }, req)).rejects.toThrow(/Demasiados intentos/);
    expect(db.systemUser.findUnique).not.toHaveBeenCalled();
  });
});

describe('registro de accesos', () => {
  test('se borran los registros de más de un año', async () => {
    await limpiarRegistroAntiguo();
    const limite: Date = db.accessLog.deleteMany.mock.calls[0][0].where.createdAt.lt;
    const dias = (Date.now() - limite.getTime()) / (24 * 3600_000);
    expect(Math.round(dias)).toBe(365);
  });

  test('dirección de red en palabras', () => {
    expect(ipLegible('::1')).toBe('Este equipo (local)');
    expect(ipLegible('::ffff:192.168.1.5')).toBe('192.168.1.5');
    expect(ipLegible('200.1.2.3')).toBe('200.1.2.3');
    expect(ipLegible(null)).toBe('-');
  });
});
