import {
  tieneVisibilidadTotal,
  sedeWhere,
  assertSedeAccess,
  sedeIdParaCrear,
} from '@/lib/auth/sedeScope';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { SesionAutenticada } from '@/lib/auth/guard';

/**
 * 14-sep-2026 (SPEC 2.29): sedeScope.ts no tenía pruebas propias todavía.
 * Se agregan al mismo tiempo que el cambio de diseño (tecnico pasa a tener
 * visibilidad total, igual que admin) para dejar el nuevo comportamiento
 * fijado y evitar que alguien lo revierta pensando que es un bug -- ver
 * SPEC 2.24 vs 2.29.
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

  test('tecnico tiene visibilidad total (SPEC 2.29, antes era false)', () => {
    expect(tieneVisibilidadTotal(sesion('tecnico', 'sede-1'))).toBe(true);
  });

  test('tecnico sin sede asignada también tiene visibilidad total', () => {
    expect(tieneVisibilidadTotal(sesion('tecnico', null))).toBe(true);
  });
});

describe('sedeWhere', () => {
  test('admin no queda filtrado (objeto vacío)', () => {
    expect(sedeWhere(sesion('admin', null))).toEqual({});
  });

  test('tecnico tampoco queda filtrado desde SPEC 2.29', () => {
    expect(sedeWhere(sesion('tecnico', 'sede-1'))).toEqual({});
  });
});

describe('assertSedeAccess', () => {
  test('admin nunca lanza, sin importar la sede del registro', () => {
    expect(() => assertSedeAccess(sesion('admin', null), 'sede-x')).not.toThrow();
  });

  test('tecnico tampoco lanza para un registro de otra sede (SPEC 2.29)', () => {
    expect(() =>
      assertSedeAccess(sesion('tecnico', 'sede-1'), 'sede-2')
    ).not.toThrow();
  });

  test('tecnico tampoco lanza para un registro sin sede', () => {
    expect(() =>
      assertSedeAccess(sesion('tecnico', 'sede-1'), null)
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

  test('tecnico: desde SPEC 2.29 también debe elegir sede explícitamente cuando requerido=true (antes se le asignaba la suya sola)', () => {
    expect(() =>
      sedeIdParaCrear(sesion('tecnico', 'sede-1'), undefined, { requerido: true })
    ).toThrow(ValidationError);
  });

  test('tecnico: puede elegir una sede distinta a la suya (SPEC 2.29)', () => {
    expect(sedeIdParaCrear(sesion('tecnico', 'sede-1'), 'sede-peru', { requerido: true })).toBe(
      'sede-peru'
    );
  });

  test('sin requerido, no exige nada aunque no venga sedeId', () => {
    expect(sedeIdParaCrear(sesion('tecnico', 'sede-1'), undefined)).toBeNull();
  });
});
