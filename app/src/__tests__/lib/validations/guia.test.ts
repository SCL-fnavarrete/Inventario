// Guia de despacho nueva: reglas compartidas por pantalla y servidor (SPEC 2.104).
import { validarNuevaGuia, validarRecepcion } from '@/lib/validations/guia';

const completa = {
  assetIds: ['a1'],
  otChilexpress: '123456',
  sedeDestinoId: 'sede-2',
  fechaDespacho: '2026-09-25T13:30:00.000Z',
  receptorNombre: 'Ana Pérez',
  receptorRut: '76.123.456-0',
};

describe('validarNuevaGuia', () => {
  test('una guia completa no tiene errores', () => {
    expect(validarNuevaGuia(completa)).toEqual({});
  });

  test('cada dato que falta se marca en su campo', () => {
    expect(Object.keys(validarNuevaGuia({}))).toEqual([
      'assetIds',
      'otChilexpress',
      'sedeDestinoId',
      'fechaDespacho',
      'receptorNombre',
      'receptorRut',
    ]);
  });

  test('el RUT del receptor tiene que ser valido', () => {
    expect(validarNuevaGuia({ ...completa, receptorRut: '76.123.456-1' }).receptorRut).toMatch(/dígito verificador/);
  });
});

// Confirmar la recepcion (SPEC 2.108).
describe('validarRecepcion', () => {
  const envio = '2026-09-25T13:30:00.000Z';

  test('con quien recibio y fecha posterior al envio no hay errores', () => {
    expect(validarRecepcion({ recibidoPor: 'Ana', fechaRecepcion: '2026-09-26T10:00:00.000Z' }, envio)).toEqual({});
  });

  test('sin fecha de recepcion se acepta (se usa ahora)', () => {
    expect(validarRecepcion({ recibidoPor: 'Ana' }, envio)).toEqual({});
  });

  test('falta quien recibio', () => {
    expect(validarRecepcion({ recibidoPor: '  ' }, envio).recibidoPor).toMatch(/quién recibió/);
  });

  test('la recepcion no puede ser anterior al envio', () => {
    expect(
      validarRecepcion({ recibidoPor: 'Ana', fechaRecepcion: '2026-09-25T13:00:00.000Z' }, envio).fechaRecepcion
    ).toMatch(/anterior/);
  });
});
