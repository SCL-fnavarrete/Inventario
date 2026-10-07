// Numero y datos de una linea telefonica, y el mapeo de su importacion (SPEC 2.131).
import { destinosPermitidos, errorDeAsociacion, formatearNumero, lineaNuevaSchema, lineaSchema, mapeoLineasSchema, mapeoSugerido, normalizarNumero, opcionDelValor, sedeDelTexto } from '@/modules/lineas';

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

test('el formulario: precio vacío es sin precio y los ids vacíos son null', () => {
  expect(lineaSchema.parse({ numero: '9 1234 5678', precioMensual: '', activoId: '', empleadoId: '', estadoId: '' })).toMatchObject({
    numero: '56912345678',
    precioMensual: null,
    activoId: null,
    empleadoId: null,
    estadoId: null,
  });
});

test('un número inválido o un precio negativo marcan su campo', () => {
  const r = lineaSchema.safeParse({ numero: '123', precioMensual: -1 });
  expect(r.success).toBe(false);
  expect(r.error?.issues.map((i) => i.path[0])).toEqual(['numero', 'precioMensual']);
});

test('el mapeo se propone por el nombre de la columna, sin tildes ni mayúsculas', () => {
  expect(
    mapeoSugerido(['Línea normalizada', 'ESTADO', 'Precio plan', 'Descripcion plan', 'Documento(s)', 'Otra'])
  ).toEqual({ numero: 'Línea normalizada', estado: 'ESTADO', precio: 'Precio plan', plan: 'Descripcion plan', rut: 'Documento(s)' });
});

test('un mapeo con JSON roto o un campo desconocido es un error de datos, no del servidor', () => {
  expect(mapeoLineasSchema.safeParse('{roto').success).toBe(false);
  expect(mapeoLineasSchema.safeParse(JSON.stringify({ numero: 'A', otro: 'B' })).success).toBe(false);
  expect(mapeoLineasSchema.parse(JSON.stringify({ numero: 'A' }))).toEqual({ numero: 'A' });
});

describe('línea nueva y archivo de inventario (SPEC 2.131)', () => {
  const UUID = '3f2b8c1e-9d4a-4e6b-8a7c-1f2e3d4c5b6a';

  test('una línea nueva lleva plan, precio, tipo de chip, operador y sede; editar o importar no lo exige', () => {
    const resto = { tipoChipId: UUID, operadorId: UUID, sedeId: UUID };
    const faltan = (d: object) => lineaNuevaSchema.safeParse({ numero: '9 1234 5678', ...d }).error?.issues.map((i) => i.path[0]);
    expect(faltan({})).toEqual(['planId', 'precioMensual', 'tipoChipId', 'operadorId', 'sedeId']);
    expect(faltan({ ...resto, planId: UUID })).toEqual(['precioMensual']);
    expect(faltan({ ...resto, planId: UUID, precioMensual: '' })).toEqual(['precioMensual']);
    expect(faltan({ planId: UUID, precioMensual: '0', operadorId: UUID, sedeId: UUID })).toEqual(['tipoChipId']);
    expect(faltan({ ...resto, planId: UUID, precioMensual: '0' })).toBeUndefined();
    // La asociacion es opcional.
    expect(lineaNuevaSchema.safeParse({ numero: '9 1234 5678', ...resto, planId: UUID, precioMensual: '0', activoId: '', empleadoId: '' }).success).toBe(true);
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

  test('el inventario de celulares: "Estado" es el tipo de chip, "Observación" la ubicación e "Incidencia" las observaciones', () => {
    const m = mapeoSugerido(['RUT', 'Nombre', 'Apellido P.', 'Apellido M.', 'IMEI ', 'Estado', 'N° Telefono', 'Operador', 'Fecha entrega', 'Incidencia', 'Observación']);
    expect(m).toEqual({
      numero: 'N° Telefono', tipoChip: 'Estado', operador: 'Operador', rut: 'RUT', nombre: 'Nombre', apellidoPaterno: 'Apellido P.',
      apellidoMaterno: 'Apellido M.', fechaEntrega: 'Fecha entrega', responsable: 'Observación', observaciones: 'Incidencia', imei: 'IMEI ',
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

describe('sede de una línea (SPEC 2.131)', () => {
  const sedes = [
    { id: 's1', nombre: 'Santiago' },
    { id: 's2', nombre: 'Concepción' },
  ];

  test('el texto de ubicación que nombra una sola sede pasa a esa sede, sin importar tildes ni mayúsculas', () => {
    expect(sedeDelTexto(sedes, 'Bodega Concepción')).toBe('s2');
    expect(sedeDelTexto(sedes, 'bodega CONCEPCION')).toBe('s2');
    expect(sedeDelTexto(sedes, 'Oficina Santiago')).toBe('s1');
  });

  test('sin sede cuando el texto no nombra ninguna o nombra varias', () => {
    expect(sedeDelTexto(sedes, 'Bodega Valdivia')).toBeNull();
    expect(sedeDelTexto(sedes, 'Santiago y Concepción')).toBeNull();
    expect(sedeDelTexto(sedes, '')).toBeNull();
    expect(sedeDelTexto(sedes, null)).toBeNull();
  });

  test('la línea acepta una sede (id) o vacía, y ya no lleva texto de responsable', () => {
    const UUID = '3f2b8c1e-9d4a-4e6b-8a7c-1f2e3d4c5b6a';
    expect(lineaSchema.parse({ numero: '9 1234 5678', sedeId: UUID })).toMatchObject({ sedeId: UUID });
    expect(lineaSchema.parse({ numero: '9 1234 5678', sedeId: '' })).toMatchObject({ sedeId: null });
    expect(lineaSchema.safeParse({ numero: '9 1234 5678', sedeId: 'x' }).success).toBe(false);
    expect(lineaSchema.parse({ numero: '9 1234 5678', responsable: 'Bodega' })).not.toHaveProperty('responsable');
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

  test('el detalle tiene largo máximo y la sede, si viene, es un id', () => {
    expect(reasignacionSchema.safeParse({ destino: 'ninguno', detalle: 'x'.repeat(501) }).success).toBe(false);
    expect(reasignacionSchema.safeParse({ destino: 'ninguno', sedeId: 'no-es-un-id' }).success).toBe(false);
    expect(reasignacionSchema.parse({ destino: 'ninguno', sedeId: '' })).toMatchObject({ sedeId: null });
    expect(reasignacionSchema.parse({ destino: 'ninguno', sedeId: UUID })).toMatchObject({ sedeId: UUID });
  });
});
