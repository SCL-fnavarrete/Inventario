/** @jest-environment node */

/**
 * Construccion del snapshot desde la transaccion del hecho de negocio.
 *
 * Los generadores viejos resolvian los activos con
 * `employee.assignments where activo = true`: el anexo de una entrega de marzo
 * mostraba los equipos que la persona tuviera el dia de la descarga. Aqui las
 * asignaciones se piden por id —exactamente las que participaron en el acto— y
 * el nombre de la categoria se congela tal como estaba al emitir, junto al
 * `tipoDevolucion` estable de la Ola 2.
 */

import { datosDeCambio, datosDeDevolucion, datosDeEntrega } from '@/lib/documents/snapshotBuilder';
import { documentoSnapshotSchema } from '@/lib/documents/snapshot';
import { FIRMA_VALIDA } from '@/test-utils/signature';

const FECHA = new Date('2026-03-04T12:34:56.000Z');
const FIRMA = { imagenPng: FIRMA_VALIDA, firmadaEn: new Date('2026-03-04T12:30:00.000Z') };

const EMPLEADO = {
  id: 'employee-1',
  nombres: 'Ada',
  apellidoPaterno: 'Lovelace',
  apellidoMaterno: 'King',
  rut: '11.111.111-1',
  correo: 'ada@sclconsultores.com',
  cargo: 'Ingeniera',
  fechaIngreso: new Date('2026-01-15T00:00:00.000Z'),
};

function asignacion(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    assetId: `asset-${id}`,
    estadoDevolucion: null,
    asset: {
      id: `asset-${id}`,
      marca: 'Lenovo',
      modelo: 'ThinkPad T14',
      numeroSerie: `SN-${id}`,
      condicion: 'nuevo',
      procesador: 'i7',
      ram: '16GB',
      discoDuro: '512GB',
      sistemaOperativo: 'Windows 11',
      imei: null,
      numeroTelefono: null,
      operador: null,
      categoria: { nombre: 'Notebook corporativo', tipoDevolucion: 'notebook' },
    },
    ...overrides,
  };
}

function txCon(asignaciones: ReturnType<typeof asignacion>[]) {
  return {
    employee: { findUnique: jest.fn().mockResolvedValue(EMPLEADO) },
    assignment: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        asignaciones.filter((a) => where.id.in.includes(a.id))
      ),
    },
  };
}

const SOLICITUD = { id: 'request-1', numero: 'WF-2026-0007', tipo: 'onboarding' };

describe('datosDeEntrega', () => {
  test('produce anexo y comprobante validos con las asignaciones exactas del acto', async () => {
    const tx = txCon([asignacion('a1'), asignacion('a2'), asignacion('ajena')]);

    const { anexo, comprobante } = await datosDeEntrega(tx as never, {
      employeeId: 'employee-1',
      assignmentIds: ['a1', 'a2'],
      solicitud: SOLICITUD,
      gestionadoPor: 'Tecnico TI',
      fechaEntrega: FECHA,
      lugarEntrega: 'Santiago',
      cargoSolicitado: 'Ingeniera de Software',
      firma: FIRMA,
    });

    expect(anexo.activos.map((a) => a.assignmentId)).toEqual(['a1', 'a2']);
    expect(comprobante.activos.map((a) => a.assignmentId)).toEqual(['a1', 'a2']);
    // Ambos son snapshots completos salvo la identidad que pone la emision.
    const completo = {
      snapshotVersion: 1,
      numero: 'DOC-2026-0001',
      version: 1,
      emitidoEn: FECHA.toISOString(),
      emitidoPor: 'Tecnico TI',
    };
    expect(documentoSnapshotSchema.safeParse({ ...anexo, ...completo }).success).toBe(true);
    expect(documentoSnapshotSchema.safeParse({ ...comprobante, ...completo }).success).toBe(true);
  });

  test('congela el nombre observado de la categoria junto al tipo estable', async () => {
    const tx = txCon([asignacion('a1')]);

    const { anexo } = await datosDeEntrega(tx as never, {
      employeeId: 'employee-1',
      assignmentIds: ['a1'],
      solicitud: SOLICITUD,
      gestionadoPor: 'Tecnico TI',
      fechaEntrega: FECHA,
      lugarEntrega: null,
      cargoSolicitado: null,
      firma: FIRMA,
    });

    expect(anexo.activos[0]).toMatchObject({
      categoriaNombre: 'Notebook corporativo',
      tipoDevolucion: 'notebook',
      numeroSerie: 'SN-a1',
    });
  });

  test('lleva la firma y la aceptacion de politica al snapshot, con hora de servidor', async () => {
    const tx = txCon([asignacion('a1')]);

    const { anexo } = await datosDeEntrega(tx as never, {
      employeeId: 'employee-1',
      assignmentIds: ['a1'],
      solicitud: SOLICITUD,
      gestionadoPor: 'Tecnico TI',
      fechaEntrega: FECHA,
      lugarEntrega: null,
      cargoSolicitado: null,
      firma: FIRMA,
    });

    expect(anexo.aceptaPoliticaUso).toBe(true);
    expect(anexo.firma).toEqual({
      imagenPng: FIRMA_VALIDA,
      firmadaEn: '2026-03-04T12:30:00.000Z',
    });
    expect(anexo.fechaEntrega).toBe(FECHA.toISOString());
  });

  test('el cargo solicitado en la solicitud manda sobre el del maestro', async () => {
    const tx = txCon([asignacion('a1')]);

    const { anexo } = await datosDeEntrega(tx as never, {
      employeeId: 'employee-1',
      assignmentIds: ['a1'],
      solicitud: SOLICITUD,
      gestionadoPor: 'Tecnico TI',
      fechaEntrega: FECHA,
      lugarEntrega: null,
      cargoSolicitado: 'Ingeniera de Software',
      firma: FIRMA,
    });

    expect(anexo.empleado.cargo).toBe('Ingeniera de Software');
  });

  test('no arma un documento de un empleado que no existe', async () => {
    const tx = txCon([asignacion('a1')]);
    tx.employee.findUnique.mockResolvedValue(null);

    await expect(
      datosDeEntrega(tx as never, {
        employeeId: 'fantasma',
        assignmentIds: ['a1'],
        solicitud: SOLICITUD,
        gestionadoPor: 'Tecnico TI',
        fechaEntrega: FECHA,
        lugarEntrega: null,
        cargoSolicitado: null,
        firma: FIRMA,
      })
    ).rejects.toThrow(/[Ee]mpleado/);
  });
});

describe('datosDeCambio', () => {
  test('describe el equipo que sale y el que entra', async () => {
    const tx = txCon([asignacion('vieja'), asignacion('nueva')]);

    const datos = await datosDeCambio(tx as never, {
      employeeId: 'employee-1',
      solicitud: { ...SOLICITUD, tipo: 'cambio_equipo' },
      gestionadoPor: 'Tecnico TI',
      fecha: FECHA,
      motivoCambio: 'Pantalla quebrada',
      assignmentAnteriorId: 'vieja',
      assignmentNuevoId: 'nueva',
      firma: FIRMA,
    });

    expect(datos.equipoAnterior).toMatchObject({ assignmentId: 'vieja' });
    expect(datos.equipoNuevo).toMatchObject({ assignmentId: 'nueva' });
    expect(datos.motivoCambio).toBe('Pantalla quebrada');
  });

  test('acepta un cambio sin equipo anterior sin inventar uno', async () => {
    const tx = txCon([asignacion('nueva')]);

    const datos = await datosDeCambio(tx as never, {
      employeeId: 'employee-1',
      solicitud: { ...SOLICITUD, tipo: 'cambio_equipo' },
      gestionadoPor: 'Tecnico TI',
      fecha: FECHA,
      motivoCambio: 'Equipo adicional',
      assignmentAnteriorId: null,
      assignmentNuevoId: 'nueva',
      firma: FIRMA,
    });

    expect(datos.equipoAnterior).toBeNull();
  });

  test('captura con qué estado volvió el equipo anterior', async () => {
    // El comprobante imprimía "Devolución OK" como literal fijo, y el snapshot
    // no capturaba `estadoDevolucion` aunque el flujo sí lo registra: se cambia
    // un notebook con la pantalla quebrada, el técnico declara `danado`, y el
    // documento que la persona firma dice que volvió OK.
    const tx = txCon([asignacion('vieja', { estadoDevolucion: 'danado' }), asignacion('nueva')]);

    const datos = await datosDeCambio(tx as never, {
      employeeId: 'employee-1',
      solicitud: { ...SOLICITUD, tipo: 'cambio_equipo' },
      gestionadoPor: 'Tecnico TI',
      fecha: FECHA,
      motivoCambio: 'Pantalla quebrada',
      assignmentAnteriorId: 'vieja',
      assignmentNuevoId: 'nueva',
      firma: FIRMA,
    });

    expect(datos.equipoAnterior?.estadoDevolucion).toBe('danado');
  });
});

describe('datosDeDevolucion', () => {
  test('registra el estado con que se recibio cada equipo', async () => {
    const tx = txCon([
      asignacion('a1', { estadoDevolucion: 'ok' }),
      asignacion('a2', { estadoDevolucion: 'danado' }),
    ]);

    const datos = await datosDeDevolucion(tx as never, {
      employeeId: 'employee-1',
      solicitud: { ...SOLICITUD, tipo: 'devolucion_termino' },
      recibidoPor: 'Tecnico TI',
      fechaDevolucion: FECHA,
      fechaTermino: new Date('2026-03-01T00:00:00.000Z'),
      lugarDevolucion: 'Santiago',
      observaciones: 'Falta el cargador',
      assignmentIds: ['a1', 'a2'],
      firma: FIRMA,
    });

    expect(datos.activos.map((a) => a.estadoDevolucion)).toEqual(['ok', 'danado']);
    expect(datos.fechaTermino).toBe('2026-03-01T00:00:00.000Z');
    expect(datos.observaciones).toBe('Falta el cargador');
  });

  test('rechaza el acta si una asignacion no tiene estado de devolución declarado', async () => {
    // Si esta validación desaparece, `null` vuelve a convertirse en `ok` y el
    // acta afirma una revisión que el técnico nunca realizó.
    const tx = txCon([asignacion('sin-estado')]);

    await expect(
      datosDeDevolucion(tx as never, {
        employeeId: 'employee-1',
        solicitud: { ...SOLICITUD, tipo: 'devolucion_termino' },
        recibidoPor: 'Tecnico TI',
        fechaDevolucion: FECHA,
        fechaTermino: null,
        lugarDevolucion: 'Santiago',
        observaciones: null,
        assignmentIds: ['sin-estado'],
        firma: FIRMA,
      })
    ).rejects.toThrow(/estado.*devoluci.n/i);
  });
});
