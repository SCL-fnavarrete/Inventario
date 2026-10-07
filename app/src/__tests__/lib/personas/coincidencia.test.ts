import { buscarPersona, mismoNombre, mismoRut, palabrasDeNombre, type PersonaIndexada } from '@/modules/personas';

// SPEC 2.133: encontrar a la persona de una fila por RUT o por nombre.
const persona = (id: string, rut: string | null, nombres: string, paterno: string, materno: string | null): PersonaIndexada => ({
  id,
  rut,
  nombres,
  apellidoPaterno: paterno,
  apellidoMaterno: materno,
  estado: 'activo',
  correoEmpresa: null,
  correoPersonal: null,
  cargo: null,
  jefatura: null,
  supervisor: null,
  ubicacion: null,
});

const INDICE = [
  persona('1', '18.808.525-3', 'Francisco Gabriel', 'Saez', 'Friz'),
  persona('2', '19.702.991-9', 'Jorge Andres', 'Matus de la Parra', 'Montecinos'),
  persona('3', '26.117.545-2', 'Joimary Isbely', 'Gutierrez', 'Alcala'),
  persona('4', '18.665.756-K', 'Bastian Antonio', 'Gutierrez', 'Farías'),
  persona('5', null, 'Felipe Alejandro', 'Muñoz', 'Suarez'),
];

describe('palabras del nombre', () => {
  test('sin tildes, mayúsculas ni partículas', () => {
    expect(palabrasDeNombre('Matus de la Parra')).toEqual(['matus', 'parra']);
    expect(palabrasDeNombre('  María  José ')).toEqual(['maria', 'jose']);
    expect(palabrasDeNombre(null)).toEqual([]);
  });
});

describe('mismo RUT', () => {
  test('ignora puntos, guion y mayúsculas', () => {
    expect(mismoRut('18.665.756-k', '18665756-K')).toBe(true);
    expect(mismoRut('18.665.756-K', '18.665.756-1')).toBe(false);
    expect(mismoRut(null, '18.665.756-K')).toBe(false);
  });
});

describe('mismo nombre', () => {
  test('una letra de diferencia en el apellido (Fritz / Friz) sigue siendo la misma persona', () => {
    expect(mismoNombre({ nombres: 'Francisco', apellidoPaterno: 'Saez', apellidoMaterno: 'Fritz' }, INDICE[0])).toBe(true);
  });

  test('el segundo nombre puede faltar, el primer nombre no', () => {
    expect(mismoNombre({ nombres: 'Jorge', apellidoPaterno: 'Matus', apellidoMaterno: null }, INDICE[1])).toBe(true);
    expect(mismoNombre({ nombres: 'Andres', apellidoPaterno: 'Matus', apellidoMaterno: null }, INDICE[1])).toBe(false);
  });

  test('el apellido materno solo cuenta si los dos lo tienen', () => {
    expect(mismoNombre({ nombres: 'Jorge Andres', apellidoPaterno: 'Matus de la Parra' }, INDICE[1])).toBe(true);
    expect(mismoNombre({ nombres: 'Jorge Andres', apellidoPaterno: 'Matus de la Parra', apellidoMaterno: 'Perez' }, INDICE[1])).toBe(false);
  });

  test('sin nombre o sin apellido no hay coincidencia', () => {
    expect(mismoNombre({ nombres: 'Jorge' }, INDICE[1])).toBe(false);
    expect(mismoNombre({ apellidoPaterno: 'Matus' }, INDICE[1])).toBe(false);
  });
});

describe('buscar a la persona de una fila', () => {
  test('por RUT, aunque el nombre venga distinto', () => {
    const r = buscarPersona(INDICE, { rut: '18665756-k', nombres: 'Otro', apellidoPaterno: 'Nombre' });
    expect(r).toMatchObject({ tipo: 'encontrada', por: 'rut', persona: { id: '4' } });
  });

  test('sin RUT, por nombre y apellidos (Felipe Muñoz del inventario de notebooks)', () => {
    const r = buscarPersona(INDICE, { nombres: 'Felipe Alejandro', apellidoPaterno: 'Muñoz', apellidoMaterno: 'Suarez' });
    expect(r).toMatchObject({ tipo: 'encontrada', por: 'nombre', persona: { id: '5' } });
  });

  test('sin RUT y con varias coincidencias no elige: es ambigua', () => {
    const r = buscarPersona(INDICE, { nombres: 'Joimary', apellidoPaterno: 'Gutierrez' });
    expect(r.tipo).toBe('encontrada'); // Joimary solo es una
    const ambigua = buscarPersona([...INDICE, persona('6', '1-9', 'Joimary', 'Gutierrez', null)], { nombres: 'Joimary', apellidoPaterno: 'Gutierrez' });
    expect(ambigua).toMatchObject({ tipo: 'ambigua' });
  });

  test('una persona creada sin RUT recibe el RUT cuando llega', () => {
    const r = buscarPersona(INDICE, { rut: '17.111.111-1', nombres: 'Felipe Alejandro', apellidoPaterno: 'Muñoz', apellidoMaterno: 'Suarez' });
    expect(r).toMatchObject({ tipo: 'encontrada', por: 'nombre', persona: { id: '5' } });
  });

  test('un RUT nuevo con el nombre de alguien que ya tiene otro RUT es un posible duplicado', () => {
    const r = buscarPersona(INDICE, { rut: '10.000.000-8', nombres: 'Bastian Antonio', apellidoPaterno: 'Gutierrez', apellidoMaterno: 'Farias' });
    expect(r).toMatchObject({ tipo: 'duplicado', persona: { id: '4' } });
  });

  test('una persona que no está en el sistema no existe', () => {
    expect(buscarPersona(INDICE, { rut: '25.255.101-8', nombres: 'Karen', apellidoPaterno: 'Guevara' })).toEqual({ tipo: 'no_existe' });
    expect(buscarPersona(INDICE, { nombres: 'Karen', apellidoPaterno: 'Guevara' })).toEqual({ tipo: 'no_existe' });
  });
});
