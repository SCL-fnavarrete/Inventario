// Datos de la factura de una compra, en Nueva y Editar compra (SPEC 2.103).
import { validarDatosFactura } from '@/lib/validations/purchase';

const completa = {
  sedeId: 'sede-1',
  numeroFactura: 'F-001',
  fechaFactura: '2026-09-24',
  rutProveedor: '',
};

describe('validarDatosFactura', () => {
  test('sede, numero y fecha son obligatorios; el RUT del proveedor no', () => {
    expect(validarDatosFactura(completa)).toEqual({});
    expect(Object.keys(validarDatosFactura({ sedeId: '', numeroFactura: ' ', fechaFactura: '', rutProveedor: '' }))).toEqual([
      'sedeId',
      'numeroFactura',
      'fechaFactura',
    ]);
  });

  test('un RUT de proveedor escrito tiene que ser valido', () => {
    expect(validarDatosFactura({ ...completa, rutProveedor: '76.123.456-1' }).rutProveedor).toMatch(/dígito verificador/);
    expect(validarDatosFactura({ ...completa, rutProveedor: 'abc' }).rutProveedor).toMatch(/Formato de RUT/);
    expect(validarDatosFactura({ ...completa, rutProveedor: '76.123.456-0' })).toEqual({});
  });
});
