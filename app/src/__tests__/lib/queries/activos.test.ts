// Busqueda de activos compartida por Activos y Mantenciones (SPEC 2.90).
import { busquedaActivo, palabrasDeBusqueda } from '@/lib/queries/activos';

describe('palabrasDeBusqueda', () => {
  test('separa por espacios y descarta los sobrantes', () => {
    expect(palabrasDeBusqueda('  Hp   Probook 640 ')).toEqual(['Hp', 'Probook', '640']);
    expect(palabrasDeBusqueda('   ')).toEqual([]);
  });
});

describe('busquedaActivo', () => {
  const condicion = busquedaActivo('perez');
  const texto = JSON.stringify(condicion);

  test('busca la palabra en los datos del activo sin distinguir mayusculas', () => {
    expect(texto).toContain('"numeroSerie"');
    expect(texto).toContain('"marca"');
    expect(texto).toContain('"modelo"');
    expect(texto).toContain('"mode":"insensitive"');
  });

  test('tambien en la persona que tiene el equipo', () => {
    expect(texto).toContain('"empleadoActual":{"nombres"');
    expect(texto).toContain('"empleadoActual":{"apellidoPaterno"');
    expect(texto).toContain('"empleadoActual":{"rut"');
  });
});
