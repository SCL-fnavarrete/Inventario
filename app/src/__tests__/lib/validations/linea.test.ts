// Numero y datos de una linea telefonica, y el mapeo de su importacion (SPEC 2.131).
import { destinosPermitidos, errorDeAsociacion, formatearNumero, lineaNuevaSchema, lineaSchema, mapeoLineasSchema, mapeoSugerido, normalizarNumero, opcionDelValor } from '@/modules/lineas';

test.each([
  ['+56 9 1234 5678', '56912345678'],
  ['912345678', '56912345678'],
  ['56912345678', '56912345678'],
  ['(9) 1234-5678', '56912345678'],
])('normaliza %s', (texto, numero) => {
  expect(normalizarNumero(texto)).toBe(numero);
});

test.each(['12345', '221234567', '5691234567', ''])('rechaza %p: no es un celular chileno', (texto) => {
  expect(normalizarNumero(texto)).toBeNull();
});

test('se muestra como +56 9 1234 5678', () => {
  expect(formatearNumero('56912345678')).toBe('+56 9 1234 5678');
});

test('el formulario: los ids vacíos son null', () => {
  expect(lineaSchema.parse({ numero: '9 1234 5678', activoId: '', empleadoId: '', estadoId: '' })).toMatchObject({
    numero: '56912345678',
    activoId: null,
    empleadoId: null,
    estadoId: null,
  });
});

test('un número inválido marca su campo', () => {
  const r = lineaSchema.safeParse({ numero: '123' });
  expect(r.success).toBe(false);
  expect(r.error?.issues.map((i) => i.path[0])).toEqual(['numero']);
});

test('la línea ya no lleva plan, precio ni responsable', () => {
  const r = lineaSchema.parse({ numero: '9 1234 5678', planId: 'x', precioMensual: '5', responsable: 'Bodega' });
  for (const campo of ['planId', 'precioMensual', 'responsable']) expect(r).not.toHaveProperty(campo);
});

test('la sede es opcional: vacía queda sin sede y una que no es id se rechaza (SPEC 2.165)', () => {
  expect(lineaSchema.parse({ numero: '9 1234 5678', sedeId: '' }).sedeId).toBeNull();
  expect(lineaSchema.parse({ numero: '9 1234 5678' }).sedeId).toBeUndefined();
  expect(lineaSchema.safeParse({ numero: '9 1234 5678', sedeId: 'x' }).success).toBe(false);
});

test('el mapeo se propone por el nombre de la columna, sin tildes ni mayúsculas', () => {
  expect(
    mapeoSugerido(['Línea normalizada', 'ESTADO', 'Precio plan', 'Descripcion plan', 'Documento(s)', 'Otra'])
  ).toEqual({ numero: 'Línea normalizada', estado: 'ESTADO', rut: 'Documento(s)' });
});

test('un mapeo con JSON roto o un campo desconocido es un error de datos, no del servidor', () => {
  expect(mapeoLineasSchema.safeParse('{roto').success).toBe(false);
  expect(mapeoLineasSchema.safeParse(JSON.stringify({ numero: 'A', otro: 'B' })).success).toBe(false);
  expect(mapeoLineasSchema.parse(JSON.stringify({ numero: 'A' }))).toEqual({ numero: 'A' });
});

describe('línea nueva y archivo de inventario (SPEC 2.131)', () => {
  const UUID = '3f2b8c1e-9d4a-4e6b-8a7c-1f2e3d4c5b6a';

  test('una línea nueva lleva tipo de chip y operador; editar o importar no lo exige', () => {
    const resto = { tipoChipId: UUID, operadorId: UUID };
    const faltan = (d: object) => lineaNuevaSchema.safeParse({ numero: '9 1234 5678', ...d }).error?.issues.map((i) => i.path[0]);
    expect(faltan({})).toEqual(['tipoChipId', 'operadorId']);
    expect(faltan({ operadorId: UUID })).toEqual(['tipoChipId']);
    expect(faltan({ tipoChipId: UUID })).toEqual(['operadorId']);
    expect(faltan(resto)).toBeUndefined();
    // La asociacion es opcional.
    expect(lineaNuevaSchema.safeParse({ numero: '9 1234 5678', ...resto, activoId: '', empleadoId: '' }).success).toBe(true);
    expect(lineaSchema.safeParse({ numero: '9 1234 5678' }).success).toBe(true);
  });

  test('regla de asociación: chip físico a un celular, eSIM a una persona, sin tipo a nada; siempre puede quedar sin asignar', () => {
    const fisico = { sinCelular: false };
    const esim = { sinCelular: true };
    expect(destinosPermitidos(fisico)).toEqual(['telefono', 'ninguno']);
    expect(destinosPermitidos(esim)).toEqual(['persona', 'ninguno']);
    expect(destinosPermitidos(null)).toEqual(['ninguno']);
    expect(errorDeAsociacion(fisico, 'telefono')).toBeNull();
    expect(errorDeAsociacion(esim, 'persona')).toBeNull();
    expect(errorDeAsociacion(fisico, 'persona')).toMatch(/chip físico va en un celular/);
    expect(errorDeAsociacion(esim, 'telefono')).toMatch(/eSIM no va en un celular/);
    expect(errorDeAsociacion(undefined, 'telefono')).toMatch(/tipo de chip/);
    expect(errorDeAsociacion(undefined, 'ninguno')).toBeNull();
  });

  test('el operador es un id o vacío', () => {
    expect(lineaSchema.parse({ numero: '9 1234 5678', operadorId: UUID })).toMatchObject({ operadorId: UUID });
    expect(lineaSchema.parse({ numero: '9 1234 5678', operadorId: '' })).toMatchObject({ operadorId: null });
  });

  test('el inventario de celulares: "Estado" es el tipo de chip, "Incidencia" las observaciones y "Observación" (la ubicación) no se importa', () => {
    const m = mapeoSugerido(['RUT', 'Nombre', 'Apellido P.', 'Apellido M.', 'IMEI ', 'Estado', 'N° Telefono', 'Operador', 'Fecha entrega', 'Incidencia', 'Observación']);
    expect(m).toEqual({
      numero: 'N° Telefono', tipoChip: 'Estado', operador: 'Operador', rut: 'RUT', nombre: 'Nombre', apellidoPaterno: 'Apellido P.',
      apellidoMaterno: 'Apellido M.', fechaEntrega: 'Fecha entrega', observaciones: 'Incidencia', imei: 'IMEI ',
    });
    // En la conciliación sigue siendo el estado de la línea.
    expect(mapeoSugerido(['Línea normalizada', 'Estado', 'Observación'])).toEqual({ numero: 'Línea normalizada', estado: 'Estado', observaciones: 'Observación' });
  });

  test('"SIM" es Físico y "eSim" o "MFF" son eSIM / MFF; lo que es del equipo no calza con ningún tipo de chip', () => {
    const tipos = [
      { id: 'f', nombre: 'Físico' },
      { id: 'e', nombre: 'eSIM / MFF' },
    ];
    expect(opcionDelValor('tipoChip', 'SIM', tipos)).toBe('f');
    expect(opcionDelValor('tipoChip', 'eSim', tipos)).toBe('e');
    expect(opcionDelValor('tipoChip', 'MFF', tipos)).toBe('e');
    expect(opcionDelValor('tipoChip', 'físico', tipos)).toBe('f');
    for (const v of ['Usado', 'Nuevo', 'No disponible', 'Pendiente']) expect(opcionDelValor('tipoChip', v, tipos)).toBeNull();
    expect(opcionDelValor('operador', 'Entel', [{ id: 'x', nombre: 'entel' }])).toBe('x');
  });
});

describe('reasignar una línea (SPEC 2.131)', () => {
  const { reasignacionSchema } = jest.requireActual('@/modules/lineas') as typeof import('@/modules/lineas');
  const UUID = '3f2b8c1e-9d4a-4e6b-8a7c-1f2e3d4c5b6a';

  test('a un teléfono hay que elegir cuál; a una persona, quién; sin asignar no pide nada', () => {
    expect(reasignacionSchema.safeParse({ destino: 'telefono' }).error?.issues[0]).toMatchObject({ path: ['activoId'], message: 'Elige el teléfono' });
    expect(reasignacionSchema.safeParse({ destino: 'persona' }).error?.issues[0]).toMatchObject({ path: ['empleadoId'], message: 'Elige la persona' });
    expect(reasignacionSchema.safeParse({ destino: 'ninguno' }).success).toBe(true);
    expect(reasignacionSchema.parse({ destino: 'telefono', activoId: UUID })).toMatchObject({ activoId: UUID });
  });

  test('los campos vacíos del formulario son nulos y el destino debe ser uno conocido', () => {
    expect(reasignacionSchema.parse({ destino: 'ninguno', activoId: '', empleadoId: '', motivoId: '' })).toMatchObject({
      activoId: null,
      empleadoId: null,
      motivoId: null,
    });
    expect(reasignacionSchema.safeParse({ destino: 'bodega' }).success).toBe(false);
    expect(reasignacionSchema.safeParse({ destino: 'persona', empleadoId: 'no-es-un-id' }).success).toBe(false);
  });

  test('el detalle tiene largo máximo y ya no lleva sede', () => {
    expect(reasignacionSchema.safeParse({ destino: 'ninguno', detalle: 'x'.repeat(501) }).success).toBe(false);
    expect(reasignacionSchema.parse({ destino: 'ninguno', sedeId: UUID })).not.toHaveProperty('sedeId');
  });

  test('ya no lleva "desde cuándo" y puede traer el tipo de chip nuevo (SPEC 2.167)', () => {
    expect(reasignacionSchema.parse({ destino: 'ninguno', desde: '2026-01-01' })).not.toHaveProperty('desde');
    expect(reasignacionSchema.parse({ destino: 'ninguno', tipoChipId: UUID })).toMatchObject({ tipoChipId: UUID });
    expect(reasignacionSchema.parse({ destino: 'ninguno', tipoChipId: '' })).toMatchObject({ tipoChipId: null });
  });
});
