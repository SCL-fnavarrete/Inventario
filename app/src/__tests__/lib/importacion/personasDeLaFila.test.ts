/** @jest-environment node */
import { procesarFila, type ContextoFila } from '@/modules/importacion/procesarFila';
import { construirMapaCatalogo } from '@/modules/importacion/reglasFila';
import type { PersonaIndexada } from '@/modules/personas';

// SPEC 2.133: la persona de una fila se busca por RUT o por nombre y, si no
// existe, se crea siempre que la fila la traiga (sin importar el estado del equipo).
const persona = (id: string, rut: string | null, nombres: string, paterno: string, materno: string | null, estado: PersonaIndexada['estado'] = 'activo'): PersonaIndexada => ({
  id, rut, nombres, apellidoPaterno: paterno, apellidoMaterno: materno, estado,
  correoEmpresa: null, correoPersonal: null, cargo: null, jefatura: null, supervisor: null, ubicacion: null,
});

const ctx = (indice: PersonaIndexada[] = []): ContextoFila => ({
  session: { user: { id: 'u1', email: 'a@x.cl', role: 'admin', sedeId: null } } as never,
  categoriaId: 'c1',
  exigeImei: false,
  tipoMantencionId: '',
  sedeIdExplicita: 's1',
  mapaSedes: { santiago: 's1' },
  mapaMarcas: construirMapaCatalogo([{ nombre: 'Dell' }]),
  mapaSistemasOperativos: {},
  mapaAntivirus: {},
  mapaLicenciasM365: {},
  existingSeriesSet: new Set(),
  existingImeiSet: new Set(),
  employeeCache: new Map(indice.filter((p) => p.rut).map((p) => [p.rut as string, p.id])),
  empleadosDesvinculados: new Set(indice.filter((p) => p.rut && p.estado === 'desvinculado').map((p) => p.rut as string)),
  indicePersonas: indice,
});

const prismaFalso = { employee: { findUnique: jest.fn() } } as never;
let n = 0;
const fila = (extra: Record<string, string>) => ({ marca: 'Dell', modelo: 'Latitude', numeroSerie: `SN${++n}`, ...extra });
const ANA = { rut: '11.111.111-1', nombre: 'Ana María', apellidoP: 'Pérez', apellidoM: 'Soto' };

describe('quién se crea y con qué estado (vista previa)', () => {
  test.each([
    ['Asignado', 'activo'],
    ['Mantención', 'activo'],
    ['No devuelto', 'desvinculado'],
    // Con persona, Disponible pasa a Asignado: el equipo es suyo (SPEC 2.133).
    ['Disponible', 'activo'],
  ])('un equipo %s con una persona nueva: se crea %s', async (estado, esperado) => {
    const r = await procesarFila(fila({ ...ANA, estado }), ctx(), prismaFalso, true);
    expect(r).toMatchObject({ status: 'valid', persona: { accion: 'nueva', estado: esperado, porNombre: false } });
  });

  test('una persona que ya existe no se crea ni cambia de estado', async () => {
    const vigente = persona('e1', ANA.rut, 'Ana María', 'Pérez', 'Soto');
    const r = await procesarFila(fila({ ...ANA, estado: 'Disponible' }), ctx([vigente]), prismaFalso, true);
    expect(r).toMatchObject({ status: 'valid', persona: { accion: 'existente', estado: 'activo' } });
  });

  test('sin RUT se busca por nombre y apellidos (Felipe Muñoz de notebooks)', async () => {
    const sinRut = persona('e5', null, 'Felipe Alejandro', 'Muñoz', 'Suárez');
    const r = await procesarFila(
      fila({ nombre: 'Felipe Alejandro', apellidoP: 'Muñoz', apellidoM: 'Suarez', estado: 'Activo' }),
      ctx([sinRut]),
      prismaFalso,
      true
    );
    expect(r).toMatchObject({ status: 'valid', persona: { accion: 'existente', porNombre: true } });
  });

  test('sin RUT y sin nadie con ese nombre, se crea sin RUT', async () => {
    const r = await procesarFila(fila({ nombre: 'Nicolás', apellidoP: 'Gutierrez', estado: 'Mantención' }), ctx(), prismaFalso, true);
    expect(r).toMatchObject({ status: 'valid', persona: { accion: 'nueva', estado: 'activo' } });
  });

  test('dos filas con la misma persona nueva: la segunda ya la encuentra', async () => {
    const c = ctx();
    await procesarFila(fila({ ...ANA, estado: 'Asignado' }), c, prismaFalso, true);
    const r = await procesarFila(fila({ ...ANA, estado: 'Disponible' }), c, prismaFalso, true);
    expect(r).toMatchObject({ status: 'valid', persona: { accion: 'existente' } });
  });
});

describe('lo que se rechaza', () => {
  test('un nombre que calza con varias personas pide el RUT', async () => {
    const dos = [persona('a', '1-9', 'Joimary', 'Gutierrez', null), persona('b', '2-7', 'Joimary', 'Gutierrez', null)];
    const r = await procesarFila(fila({ nombre: 'Joimary', apellidoP: 'Gutierrez', estado: 'Asignado' }), ctx(dos), prismaFalso, true);
    expect(r).toMatchObject({ status: 'error', tipo: 'persona_ambigua', campo: 'rut' });
  });

  test('un RUT nuevo con el nombre de alguien que ya tiene otro RUT es un posible duplicado', async () => {
    const existente = persona('a', '18.665.756-K', 'Ana María', 'Pérez', 'Soto');
    const r = await procesarFila(fila({ ...ANA, estado: 'Asignado' }), ctx([existente]), prismaFalso, true);
    expect(r).toMatchObject({ status: 'error', tipo: 'persona_duplicada' });
  });

  test('un equipo en mantención con alguien desvinculado pide "No devuelto"', async () => {
    const fuera = persona('e1', ANA.rut, 'Ana María', 'Pérez', 'Soto', 'desvinculado');
    const r = await procesarFila(fila({ ...ANA, estado: 'Mantención' }), ctx([fuera]), prismaFalso, true);
    expect(r).toMatchObject({ status: 'error', tipo: 'empleado_desvinculado' });
  });

  test('el equipo va a quedar con alguien nuevo y la fila no trae su nombre', async () => {
    const r = await procesarFila(fila({ rut: ANA.rut, estado: 'Asignado' }), ctx(), prismaFalso, true);
    expect(r).toMatchObject({ status: 'error', tipo: 'missing_employee_data' });
  });

  test('Disponible con RUT nuevo pero sin nombre: se le iba a asignar y falta su nombre (SPEC 2.133)', async () => {
    const r = await procesarFila(fila({ rut: ANA.rut, estado: 'Disponible' }), ctx(), prismaFalso, true);
    expect(r).toMatchObject({ status: 'error', tipo: 'missing_employee_data' });
  });

  test('Baja o vendido con persona se detiene: no se adivina cuál dato está mal', async () => {
    const r = await procesarFila(fila({ ...ANA, estado: 'Baja' }), ctx(), prismaFalso, true);
    expect(r).toMatchObject({ status: 'error', campo: 'estado', mensaje: expect.stringContaining('con persona') });
  });

  test('cargo o correo sin RUT ni nombre se detiene, salvo en un equipo de baja', async () => {
    const r = await procesarFila(fila({ cargo: 'Técnico', correoEmpresa: 'x@scl.cl', estado: 'Disponible' }), ctx(), prismaFalso, true);
    expect(r).toMatchObject({ status: 'error', mensaje: expect.stringContaining('incompletos') });
    const baja = await procesarFila(fila({ correoEmpresa: 'x@scl.cl', estado: 'Baja' }), ctx(), prismaFalso, true);
    expect(baja).toMatchObject({ status: 'valid' });
  });

  test('Disponible con persona pasa a Asignado y la revisión lo cuenta', async () => {
    const r = await procesarFila(fila({ ...ANA, estado: 'Disponible' }), ctx(), prismaFalso, true);
    expect(r).toMatchObject({ status: 'valid', disponibleConPersona: true });
  });
});
