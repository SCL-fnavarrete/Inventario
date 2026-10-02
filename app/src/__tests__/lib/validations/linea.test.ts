// Numero y datos de una linea telefonica (SPEC 2.131).
import { formatearNumero, lineaSchema, normalizarNumero } from '@/modules/lineas';

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

test('el formulario: precio vacío es sin precio, ids vacíos son null, estado activa por defecto', () => {
  expect(lineaSchema.parse({ numero: '9 1234 5678', precioMensual: '', activoId: '', empleadoId: '' })).toMatchObject({
    numero: '56912345678',
    precioMensual: null,
    activoId: null,
    empleadoId: null,
    estado: 'activa',
  });
});

test('un número inválido o un precio negativo marcan su campo', () => {
  const r = lineaSchema.safeParse({ numero: '123', precioMensual: -1 });
  expect(r.success).toBe(false);
  expect(r.error?.issues.map((i) => i.path[0])).toEqual(['numero', 'precioMensual']);
});
