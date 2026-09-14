import { SystemRole } from '@prisma/client';
import {
  ACCIONES,
  RECURSOS,
  RESOURCE_PERMISSIONS,
  can,
  recursosPermitidos,
  rolesQuePueden,
  type Accion,
  type Recurso,
} from '@/lib/auth/permissions';
import { canTransition } from '@/lib/services/workflowStateMachine';

// SPEC: Sección 1.3 — Usuarios del Sistema. Solo dos roles reales: admin
// (ve y administra todo) y tecnico (soporte operativo, restringido a su
// sede -- ver sedeScope()). supervisor/rrhh/auditor existieron en una
// version anterior pero no se usaban en la practica y se retiraron.

const TODOS_LOS_ROLES: SystemRole[] = ['admin', 'tecnico'];

describe('permissions — integridad de la matriz', () => {
  test('todos los recursos declaran las tres acciones', () => {
    for (const recurso of RECURSOS) {
      for (const accion of ACCIONES) {
        expect(Array.isArray(RESOURCE_PERMISSIONS[recurso][accion])).toBe(true);
      }
    }
  });

  test('la matriz no declara roles que no existen en SystemRole', () => {
    for (const recurso of RECURSOS) {
      for (const accion of ACCIONES) {
        for (const rol of RESOURCE_PERMISSIONS[recurso][accion]) {
          expect(TODOS_LOS_ROLES).toContain(rol);
        }
      }
    }
  });

  test('ningún recurso repite un rol dentro de la misma acción', () => {
    for (const recurso of RECURSOS) {
      for (const accion of ACCIONES) {
        const roles = RESOURCE_PERMISSIONS[recurso][accion];
        expect(new Set(roles).size).toBe(roles.length);
      }
    }
  });

  test('quien puede escribir o borrar también puede leer', () => {
    for (const recurso of RECURSOS) {
      for (const rol of RESOURCE_PERMISSIONS[recurso].write) {
        expect(can(rol, recurso, 'read')).toBe(true);
      }
      for (const rol of RESOURCE_PERMISSIONS[recurso].delete) {
        expect(can(rol, recurso, 'read')).toBe(true);
      }
    }
  });
});

describe('permissions — admin', () => {
  test.each(RECURSOS)('admin puede leer, escribir y borrar %s', (recurso) => {
    expect(can('admin', recurso, 'read')).toBe(true);
    if (recurso !== 'reportes') {
      expect(can('admin', recurso, 'write')).toBe(true);
      expect(can('admin', recurso, 'delete')).toBe(true);
    }
  });
});

describe('permissions — tecnico', () => {
  test('escribe lo operativo: activos, asignaciones, mantenciones, guías, solicitudes', () => {
    expect(can('tecnico', 'activos', 'write')).toBe(true);
    expect(can('tecnico', 'asignaciones', 'write')).toBe(true);
    expect(can('tecnico', 'mantenciones', 'write')).toBe(true);
    expect(can('tecnico', 'guias', 'write')).toBe(true);
    expect(can('tecnico', 'desvinculaciones', 'write')).toBe(true);
    expect(can('tecnico', 'solicitudes', 'write')).toBe(true);
  });

  test('el borrado es de admin, salvo tiposMantencion', () => {
    // tiposMantencion.delete es de admin + tecnico por decision explicita
    // (ver nota en src/lib/auth/permissions.ts): es catalogo operativo del
    // dia a dia, no configuracion del sistema.
    for (const recurso of RECURSOS) {
      if (recurso === 'tiposMantencion') continue;
      expect(can('tecnico', recurso, 'delete')).toBe(false);
    }
    expect(can('tecnico', 'tiposMantencion', 'delete')).toBe(true);
  });

  test('no toca datos maestros ni configuración ni usuarios', () => {
    expect(can('tecnico', 'categorias', 'write')).toBe(false);
    expect(can('tecnico', 'proveedores', 'write')).toBe(false);
    expect(can('tecnico', 'usuarios', 'read')).toBe(false);
    expect(can('tecnico', 'sedes', 'write')).toBe(false);
    expect(can('tecnico', 'configuracion', 'read')).toBe(false);
  });

  // compras es trabajo operativo del tecnico, no un dato maestro (ver nota
  // "11-sep-2026, pedido explicito de Javier" en permissions.ts) -- prueba
  // separada, corregida el 14-sep-2026: antes esperaba false y nunca se
  // habia corrido en CI para detectarlo.
  test('sí puede leer y escribir compras (trabajo operativo, no dato maestro)', () => {
    expect(can('tecnico', 'compras', 'read')).toBe(true);
    expect(can('tecnico', 'compras', 'write')).toBe(true);
    expect(can('tecnico', 'compras', 'delete')).toBe(false);
  });

  test('lee lo mismo que escribe, más los datos maestros de solo lectura', () => {
    expect(can('tecnico', 'activos', 'read')).toBe(true);
    expect(can('tecnico', 'empleados', 'read')).toBe(true);
    expect(can('tecnico', 'categorias', 'read')).toBe(true);
    expect(can('tecnico', 'proveedores', 'read')).toBe(true);
    expect(can('tecnico', 'sedes', 'read')).toBe(true);
    expect(can('tecnico', 'reportes', 'read')).toBe(true);
  });
});

describe('permissions — reportes', () => {
  test('ambos roles leen reportes', () => {
    for (const rol of TODOS_LOS_ROLES) {
      expect(can(rol, 'reportes', 'read')).toBe(true);
    }
  });

  test('nadie escribe ni borra un reporte', () => {
    for (const rol of TODOS_LOS_ROLES) {
      expect(can(rol, 'reportes', 'write')).toBe(false);
      expect(can(rol, 'reportes', 'delete')).toBe(false);
    }
  });
});

describe('permissions — entradas inválidas', () => {
  test.each([undefined, null, '', 'root', 'ADMIN', 'rrhh', 'supervisor', 'auditor'])(
    '%p no obtiene permiso',
    (rol) => {
      expect(can(rol as string | null | undefined, 'activos', 'read')).toBe(false);
      expect(can(rol as string | null | undefined, 'activos', 'write')).toBe(false);
    }
  );

  test('un recurso inexistente no otorga permiso ni lanza', () => {
    expect(can('admin', 'inventado' as Recurso, 'read')).toBe(false);
  });

  test('una acción inexistente no otorga permiso ni lanza', () => {
    expect(can('admin', 'activos', 'aprobar' as Accion)).toBe(false);
  });
});

describe('permissions — la matriz no autoriza transiciones de workflow', () => {
  // La regla de quien puede transicionar vive en workflowStateMachine y esta
  // testeada alli (solo tecnico/admin, en todos los tipos). Aqui solo se fija
  // que la matriz de recursos no la duplique con otra fuente de verdad.
  test('tecnico y admin pueden ejecutar las transiciones de cierre', () => {
    expect(canTransition('onboarding', 'equipos_entregados', 'registro_rrhh', 'tecnico')).toBe(true);
    expect(canTransition('onboarding', 'equipos_entregados', 'registro_rrhh', 'admin')).toBe(true);
    expect(canTransition('cambio_equipo', 'cambio_ejecutado', 'confirmacion_rrhh', 'tecnico')).toBe(true);
    expect(
      canTransition('offboarding', 'equipo_recibido', 'consolidacion_cierre', 'tecnico')
    ).toBe(true);
  });

  test('la ruta de transición sólo exige poder leer la solicitud', () => {
    // requirePermission('solicitudes', 'read'); la maquina de estados decide
    // despues cuales transiciones puede ejecutar cada rol.
    expect(can('tecnico', 'solicitudes', 'read')).toBe(true);
  });
});

describe('permissions — helpers', () => {
  test('rolesQuePueden coincide con la matriz', () => {
    expect(rolesQuePueden('usuarios', 'write')).toEqual(['admin']);
    expect(rolesQuePueden('reportes', 'write')).toEqual([]);
  });

  test('recursosPermitidos para tecnico no incluye usuarios ni configuración', () => {
    const recursos = recursosPermitidos('tecnico', 'read');
    expect(recursos).not.toContain('usuarios');
    expect(recursos).not.toContain('configuracion');
    // compras SÍ está incluido -- es trabajo operativo del técnico, ver
    // prueba "sí puede leer y escribir compras" más arriba.
    expect(recursos).toContain('compras');
    expect(recursos.length).toBeGreaterThan(0);
  });

  test('recursosPermitidos para admin cubre todos los recursos en lectura', () => {
    expect(recursosPermitidos('admin', 'read')).toEqual([...RECURSOS]);
  });
});
