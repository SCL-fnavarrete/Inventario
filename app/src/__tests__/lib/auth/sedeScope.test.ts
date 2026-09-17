import {
  tieneVisibilidadTotal,
  sedeWhere,
  assertSedeAccess,
  sedeIdParaCrear,
} from '@/lib/auth/sedeScope';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { SesionAutenticada } from '@/lib/auth/guard';

/**
 * 18-sep-2026 (SPEC 2.29.1): estas pruebas nacieron con SPEC 2.29, cuando
 * el técnico pasó a tener visibilidad total, justamente para que nadie lo
 * revirtiera por accidente. Hoy se revierte a propósito, por decisión
 * explícita de Javier: el técnico vuelve a quedar amarrado a su sede, en la
 * interfaz y en el backend. Las expectativas se actualizan al nuevo
 * comportamiento y siguen cumpliendo el mismo rol: dejarlo fijado.
 */

function sesion(rol: string, sedeId: string | null): SesionAutenticada {
  return {
    expires: '2099-01-01T00:00:00.000Z',
    user: {
      id: 'user-1',
      role: rol,
      sedeId,
      name: 'Usuario de prueba',
      email: 'test@example.com',
    },
  } as SesionAutenticada;
}

describe('tieneVisibilidadTotal', () => {
  test('admin tiene visibilidad total', () => {
    expect(tieneVisibilidadTotal(sesion('admin', null))).toBe(true);
  });

  test('tecnico NO tiene visibilidad total (SPEC 2.29.1, revierte 2.29)', () => {
    expect(tieneVisibilidadTotal(sesion('tecnico', 'sede-1'))).toBe(false);
  });

  test('tecnico sin sede asignada tampoco', () => {
    expect(tieneVisibilidadTotal(sesion('tecnico', null))).toBe(false);
  });
});

describe('sedeWhere', () => {
  test('admin no queda filtrado (objeto vacío)', () => {
    expect(sedeWhere(sesion('admin', null))).toEqual({});
  });

  test('tecnico queda filtrado a su propia sede (SPEC 2.29.1)', () => {
    expect(sedeWhere(sesion('tecnico', 'sede-1'))).toEqual({ sedeId: 'sede-1' });
  });

  test('tecnico sin sede asignada no ve nada, en vez de ver los huerfanos', () => {
    expect(sedeWhere(sesion('tecnico', null))).toEqual({
      sedeId: '__sin_sede_asignada__',
    });
  });
});

describe('assertSedeAccess', () => {
  test('admin nunca lanza, sin importar la sede del registro', () => {
    expect(() => assertSedeAccess(sesion('admin', null), 'sede-x')).not.toThrow();
  });

  test('tecnico lanza NotFoundError para un registro de otra sede (SPEC 2.29.1)', () => {
    expect(() =>
      assertSedeAccess(sesion('tecnico', 'sede-1'), 'sede-2')
    ).toThrow(NotFoundError);
  });

  test('tecnico no accede a un registro sin sede', () => {
    expect(() =>
      assertSedeAccess(sesion('tecnico', 'sede-1'), null)
    ).toThrow(NotFoundError);
  });

  test('tecnico si accede a un registro de su propia sede', () => {
    expect(() =>
      assertSedeAccess(sesion('tecnico', 'sede-1'), 'sede-1')
    ).not.toThrow();
  });

  test('lanza NotFoundError si en algún momento vuelve a haber un rol sin visibilidad total', () => {
    // No existe hoy un tercer rol, pero se prueba la rama defensiva
    // directamente para que no quede código muerto sin cubrir.
    expect(() =>
      assertSedeAccess(sesion('rol_inventado', 'sede-1'), 'sede-2')
    ).toThrow(NotFoundError);
  });
});

describe('sedeIdParaCrear', () => {
  test('admin: exige sede cuando requerido=true y no la manda', () => {
    expect(() => sedeIdParaCrear(sesion('admin', null), undefined, { requerido: true })).toThrow(
      ValidationError
    );
  });

  test('admin: acepta la sede que elige explícitamente', () => {
    expect(sedeIdParaCrear(sesion('admin', null), 'sede-x', { requerido: true })).toBe('sede-x');
  });

  test('tecnico: se le asigna su propia sede sin tener que elegirla (SPEC 2.29.1)', () => {
    expect(
      sedeIdParaCrear(sesion('tecnico', 'sede-1'), undefined, { requerido: true })
    ).toBe('sede-1');
  });

  test('tecnico: NO puede crear en otra sede aunque mande el sedeId a mano', () => {
    expect(sedeIdParaCrear(sesion('tecnico', 'sede-1'), 'sede-peru', { requerido: true })).toBe(
      'sede-1'
    );
  });

  test('tecnico sin sede asignada: se rechaza con un mensaje util', () => {
    expect(() =>
      sedeIdParaCrear(sesion('tecnico', null), undefined, { requerido: true })
    ).toThrow(ValidationError);
  });

  test('sin requerido, admin puede dejarla en blanco', () => {
    expect(sedeIdParaCrear(sesion('admin', null), undefined)).toBeNull();
  });
});
