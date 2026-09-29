// Busqueda de activos compartida por Activos y Mantenciones (SPEC 2.90).
import { busquedaActivo, leerFiltrosActivos, palabrasDeBusqueda, whereFiltrosActivos } from '@/lib/queries/activos';
import { SIN_DATO } from '@/lib/constants/filtrosActivos';

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

// Filtros por datos de catalogo, combinables (SPEC 2.116.6).
describe('filtros por marca, sistema operativo, antivirus, licencia y motivo de baja', () => {
  const admin = { user: { id: 'a', email: 'a@x', role: 'admin', sedeId: null } } as never;

  test('varios filtros se suman con la categoria, el estado y la busqueda', () => {
    const where = whereFiltrosActivos(admin, {
      estado: 'disponible',
      categoriaId: 'c1',
      search: 'probook',
      datos: { marca: 'HP', so: 'Windows 11 Pro' },
    });
    expect(where).toMatchObject({ estado: 'disponible', categoriaId: 'c1' });
    expect(where.AND).toHaveLength(3);
    expect(where.AND).toEqual(expect.arrayContaining([{ marca: 'HP' }, { sistemaOperativo: 'Windows 11 Pro' }]));
  });

  test('"Sin ..." busca los que no tienen el dato', () => {
    const where = whereFiltrosActivos(admin, { datos: { antivirus: SIN_DATO } });
    expect(where.AND).toEqual([{ OR: [{ antivirus: null }, { antivirus: '' }] }]);
  });

  test('motivo de baja: por la mantencion de baja, o bajas sin motivo', () => {
    expect(whereFiltrosActivos(admin, { datos: { motivoBaja: 'm1' } }).AND).toEqual([
      { maintenances: { some: { motivoBajaId: 'm1' } } },
    ]);
    expect(whereFiltrosActivos(admin, { datos: { motivoBaja: SIN_DATO } }).AND).toEqual([
      { estado: 'baja', maintenances: { none: { motivoBajaId: { not: null } } } },
    ]);
  });

  test('se leen de la URL, sin vacios y con tope de largo', () => {
    const f = leerFiltrosActivos(new URLSearchParams(`marca=Dell&licencia=&so=${'x'.repeat(300)}`));
    expect(f.datos).toEqual({ marca: 'Dell', so: 'x'.repeat(100) });
  });
});
