// Busqueda de activos compartida por Activos y Mantenciones (SPEC 2.90).
import { busquedaActivo, palabrasDeBusqueda, whereFiltrosActivos } from '@/lib/queries/activos';

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

// Filtros compartidos por la lista de Activos y su exportacion (SPEC 2.108).
describe('whereFiltrosActivos', () => {
  const admin = { user: { id: 'a', email: 'a@x', role: 'admin', sedeId: null } } as never;
  const tecnico = { user: { id: 't', email: 't@x', role: 'tecnico', sedeId: 'conce' } } as never;

  test('un estado que no existe (como "por_llegar") se ignora en vez de romper', () => {
    expect(whereFiltrosActivos(admin, { estado: 'por_llegar' })).not.toHaveProperty('estado');
    expect(whereFiltrosActivos(admin, { estado: 'disponible' }).estado).toBe('disponible');
  });

  test('el tecnico ve solo su sede aunque pida otra', () => {
    const where = whereFiltrosActivos(tecnico, { sedeIdFiltro: 'stgo' });
    expect(JSON.stringify(where)).toContain('conce');
    expect(JSON.stringify(where)).not.toContain('stgo');
  });

  test('"Por llegar" trae lo que viene a mi sede, sin filtrar por la sede del equipo', () => {
    const where = whereFiltrosActivos(admin, { porLlegar: true, sedeIdFiltro: 'conce' });
    expect(where.estado).toBe('en_transito');
    expect(where).not.toHaveProperty('sedeId');
    expect(JSON.stringify(where.dispatchItems)).toContain('conce');
  });
});
