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

// SPEC: Sección 1.3 — Usuarios del Sistema

const TODOS_LOS_ROLES: SystemRole[] = ['admin', 'tecnico', 'supervisor', 'rrhh', 'auditor'];

/** Recursos operativos: todo lo que no es un reporte de solo lectura. */
const RECURSOS_OPERATIVOS: Recurso[] = RECURSOS.filter((r) => r !== 'reportes');

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

describe('permissions — solo lectura (regla base del SPEC)', () => {
  // Caso obligatorio del plan: la regresión más cara de reintroducir.
  test.each(RECURSOS_OPERATIVOS)('rrhh NO puede escribir en %s', (recurso) => {
    expect(can('rrhh', recurso, 'write')).toBe(false);
  });

  test.each(RECURSOS_OPERATIVOS)('rrhh NO puede borrar en %s', (recurso) => {
    expect(can('rrhh', recurso, 'delete')).toBe(false);
  });

  test.each(RECURSOS_OPERATIVOS)('auditor NO puede escribir en %s', (recurso) => {
    expect(can('auditor', recurso, 'write')).toBe(false);
  });

  test.each(RECURSOS_OPERATIVOS)('auditor NO puede borrar en %s', (recurso) => {
    expect(can('auditor', recurso, 'delete')).toBe(false);
  });

  test('auditor lee todo el sistema salvo usuarios y configuración', () => {
    for (const recurso of RECURSOS) {
      const esperado = recurso !== 'usuarios' && recurso !== 'configuracion';
      expect(can('auditor', recurso, 'read')).toBe(esperado);
    }
  });

  test('rrhh lee fichas de empleados y estados de devolución', () => {
    expect(can('rrhh', 'empleados', 'read')).toBe(true);
    expect(can('rrhh', 'desvinculaciones', 'read')).toBe(true);
    expect(can('rrhh', 'asignaciones', 'read')).toBe(true);
    expect(can('rrhh', 'activos', 'read')).toBe(true);
  });

  test('rrhh no ve información financiera ni configuración', () => {
    expect(can('rrhh', 'compras', 'read')).toBe(false);
    expect(can('rrhh', 'proveedores', 'read')).toBe(false);
    expect(can('rrhh', 'usuarios', 'read')).toBe(false);
    expect(can('rrhh', 'configuracion', 'read')).toBe(false);
  });
});

describe('permissions — tecnico', () => {
  test('escribe lo operativo: activos, asignaciones, mantenciones, guías', () => {
    expect(can('tecnico', 'activos', 'write')).toBe(true);
    expect(can('tecnico', 'asignaciones', 'write')).toBe(true);
    expect(can('tecnico', 'mantenciones', 'write')).toBe(true);
    expect(can('tecnico', 'guias', 'write')).toBe(true);
    expect(can('tecnico', 'desvinculaciones', 'write')).toBe(true);
  });

  test('no borra nada: el borrado es de admin', () => {
    for (const recurso of RECURSOS) {
      expect(can('tecnico', recurso, 'delete')).toBe(false);
    }
  });

  test('no toca datos maestros ni configuración', () => {
    expect(can('tecnico', 'categorias', 'write')).toBe(false);
    expect(can('tecnico', 'proveedores', 'write')).toBe(false);
    expect(can('tecnico', 'usuarios', 'read')).toBe(false);
    expect(can('tecnico', 'configuracion', 'read')).toBe(false);
  });
});

describe('permissions — supervisor', () => {
  test('aprueba solicitudes, según el SPEC', () => {
    expect(can('supervisor', 'solicitudes', 'write')).toBe(true);
  });

  test('no ejecuta trabajo operativo de TI', () => {
    expect(can('supervisor', 'activos', 'write')).toBe(false);
    expect(can('supervisor', 'mantenciones', 'write')).toBe(false);
    expect(can('supervisor', 'asignaciones', 'write')).toBe(false);
  });

  test('ve reportes', () => {
    expect(can('supervisor', 'reportes', 'read')).toBe(true);
  });
});

describe('permissions — reportes', () => {
  test('los cinco roles leen reportes', () => {
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
  test.each([undefined, null, '', 'root', 'ADMIN'])('%p no obtiene permiso', (rol) => {
    expect(can(rol as string | null | undefined, 'activos', 'read')).toBe(false);
    expect(can(rol as string | null | undefined, 'activos', 'write')).toBe(false);
  });

  test('un recurso inexistente no otorga permiso ni lanza', () => {
    expect(can('admin', 'inventado' as Recurso, 'read')).toBe(false);
  });

  test('una acción inexistente no otorga permiso ni lanza', () => {
    expect(can('admin', 'activos', 'aprobar' as Accion)).toBe(false);
  });
});

describe('permissions — la matriz no autoriza transiciones de workflow', () => {
  // La regla de quien puede transicionar vive en workflowStateMachine y esta
  // testeada alli. Aqui solo se fija que la matriz NO la duplique: rrhh sigue
  // sin escritura sobre el recurso, y aun asi puede confirmar.
  test('rrhh no tiene write sobre solicitudes en la matriz', () => {
    expect(can('rrhh', 'solicitudes', 'write')).toBe(false);
  });

  test('rrhh sí puede ejecutar las transiciones de confirmación', () => {
    expect(canTransition('onboarding', 'equipos_entregados', 'registro_rrhh', 'rrhh')).toBe(true);
    expect(canTransition('cambio_equipo', 'cambio_ejecutado', 'confirmacion_rrhh', 'rrhh')).toBe(true);
    expect(
      canTransition('offboarding', 'equipo_recibido', 'consolidacion_cierre', 'rrhh')
    ).toBe(true);
  });

  test('rrhh no puede ejecutar las transiciones operativas de TI', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'gestion_ti', 'rrhh')).toBe(false);
    expect(canTransition('onboarding', 'gestion_ti', 'equipos_entregados', 'rrhh')).toBe(false);
  });

  test('auditor no puede ejecutar ninguna transición', () => {
    expect(canTransition('onboarding', 'equipos_entregados', 'registro_rrhh', 'auditor')).toBe(false);
    expect(canTransition('onboarding', 'solicitud_recibida', 'gestion_ti', 'auditor')).toBe(false);
  });

  test('la ruta de transición sólo exige poder leer la solicitud', () => {
    // requirePermission('solicitudes', 'read') deja pasar a rrhh; la maquina
    // de estados decide despues. Si la matriz exigiera write, rrhh nunca
    // llegaria a confirmar.
    expect(can('rrhh', 'solicitudes', 'read')).toBe(true);
  });
});

describe('permissions — helpers', () => {
  test('rolesQuePueden coincide con la matriz', () => {
    expect(rolesQuePueden('usuarios', 'write')).toEqual(['admin']);
    expect(rolesQuePueden('reportes', 'write')).toEqual([]);
  });

  test('recursosPermitidos para auditor solo devuelve lectura', () => {
    expect(recursosPermitidos('auditor', 'write')).toEqual([]);
    expect(recursosPermitidos('auditor', 'delete')).toEqual([]);
    expect(recursosPermitidos('auditor', 'read').length).toBeGreaterThan(0);
  });

  test('recursosPermitidos para admin cubre todos los recursos en lectura', () => {
    expect(recursosPermitidos('admin', 'read')).toEqual([...RECURSOS]);
  });
});
