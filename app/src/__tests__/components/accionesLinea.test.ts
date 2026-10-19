/**
 * Acciones escritas de una línea en su ficha (SPEC 2.167): solo las que aplican
 * según su tipo de chip y dónde está; una línea que usa una persona no tiene.
 */
import { accionesDeLinea, destinoDeAccion } from '@/modules/lineas/componentes/ReasignarLinea';

const activa = { nombre: 'Activa', deBaja: false, id: 'e' };
const fisico = { id: 'f', nombre: 'Físico', sinCelular: false };
const esim = { id: 'e', nombre: 'eSIM', sinCelular: true };
const celular = { id: 'c', marca: 'Samsung', modelo: 'A15', imei: null, empleadoActual: null };
const persona = { id: 'p', nombres: 'Ana', apellidoPaterno: 'Rojas', rut: null };
const linea = (extra: object) => ({
  activo: null,
  empleado: null,
  tipoChip: fisico,
  estado: activa,
  ...extra,
});
const claves = (extra: object) => accionesDeLinea(linea(extra)).map((a) => a.clave);

describe('accionesDeLinea', () => {
  test('chip físico disponible: asignar a un teléfono o cambiar a eSIM', () => {
    expect(claves({})).toEqual(['telefono', 'aEsim']);
    expect(accionesDeLinea(linea({}))[0].titulo).toBe('Asignar a un teléfono sin línea');
  });

  test('chip físico en un teléfono sin persona: mover, cambiar a eSIM o sacar el chip', () => {
    expect(claves({ activo: celular })).toEqual(['telefono', 'aEsim', 'sacar']);
    expect(accionesDeLinea(linea({ activo: celular }))[0].titulo).toBe('Mover a otro teléfono');
  });

  test('eSIM disponible: asignar a una persona o cambiar a chip físico', () => {
    expect(claves({ tipoChip: esim })).toEqual(['persona', 'aFisico']);
  });

  test('la que usa una persona, la de baja o sin tipo de chip no tiene acciones', () => {
    expect(claves({ activo: { ...celular, empleadoActual: persona } })).toEqual([]);
    expect(claves({ tipoChip: esim, empleado: persona })).toEqual([]);
    expect(claves({ estado: { ...activa, deBaja: true } })).toEqual([]);
    expect(claves({ tipoChip: null })).toEqual([]);
  });
});

describe('destinoDeAccion', () => {
  const nada = { activoId: '', empleadoId: '' };
  test('al cambiar el tipo, el destino es opcional: sin elegir, queda disponible', () => {
    expect(destinoDeAccion('aEsim', nada)).toBe('ninguno');
    expect(destinoDeAccion('aEsim', { ...nada, empleadoId: 'p' })).toBe('persona');
    expect(destinoDeAccion('aFisico', { ...nada, activoId: 'c' })).toBe('telefono');
    expect(destinoDeAccion('sacar', nada)).toBe('ninguno');
    expect(destinoDeAccion('telefono', nada)).toBe('telefono');
  });
});
