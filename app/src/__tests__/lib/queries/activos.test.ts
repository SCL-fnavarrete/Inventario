// Busqueda de activos compartida por Activos y Mantenciones (SPEC 2.90).
import { busquedaActivo, leerFiltrosActivos, palabrasDeBusqueda, whereFiltrosActivos } from '@/modules/activos/consultas';
import { SIN_DATO } from '@/modules/activos/filtros';

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
  test('un estado que no existe (como "por_llegar") se ignora en vez de romper', () => {
    expect(whereFiltrosActivos({ estado: 'por_llegar' })).not.toHaveProperty('estado');
    expect(whereFiltrosActivos({ estado: 'disponible' }).estado).toBe('disponible');
  });

  // SPEC 2.117: la sede no restringe; la elegida en el navbar solo filtra.
  test('filtra por la sede elegida; sin sede, trae todas', () => {
    expect(whereFiltrosActivos({ sedeIdFiltro: 'stgo' }).sedeId).toBe('stgo');
    expect(whereFiltrosActivos({})).not.toHaveProperty('sedeId');
  });

  test('"Por llegar" trae lo que viene a mi sede, sin filtrar por la sede del equipo', () => {
    const where = whereFiltrosActivos({ porLlegar: true, sedeIdFiltro: 'conce' });
    expect(where.estado).toBe('en_transito');
    expect(where).not.toHaveProperty('sedeId');
    expect(JSON.stringify(where.dispatchItems)).toContain('conce');
  });
});

// Filtros por datos de catalogo, combinables (SPEC 2.116.6).
describe('filtros por marca, sistema operativo, antivirus, licencia y motivo de baja', () => {

  test('varios filtros se suman con la categoria, el estado y la busqueda', () => {
    const where = whereFiltrosActivos({
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
    const where = whereFiltrosActivos({ datos: { antivirus: SIN_DATO } });
    expect(where.AND).toEqual([{ OR: [{ antivirus: null }, { antivirus: '' }] }]);
  });

  test('motivo de baja: por la mantencion de baja, o bajas sin motivo', () => {
    expect(whereFiltrosActivos({ datos: { motivoBaja: 'm1' } }).AND).toEqual([
      // El motivo esta en la mantencion de la baja o en la devolucion de un cambio (SPEC 2.126).
      {
        estado: 'baja',
        OR: [
          { maintenances: { some: { motivoBajaId: 'm1' } } },
          { assignments: { some: { motivoBajaId: 'm1' } } },
        ],
      },
    ]);
    expect(whereFiltrosActivos({ datos: { motivoBaja: SIN_DATO } }).AND).toEqual([
      {
        estado: 'baja',
        maintenances: { none: { motivoBajaId: { not: null } } },
        assignments: { none: { motivoBajaId: { not: null } } },
      },
    ]);
  });

  test('"Sin sede" busca los equipos sin sede, aunque el navbar diga "Todas" (SPEC 2.117)', () => {
    const where = whereFiltrosActivos({ datos: { sede: SIN_DATO } });
    expect(where.AND).toEqual([{ sedeId: null }]);
    expect(where.sedeId).toBeUndefined();
  });

  test('se leen de la URL, sin vacios y con tope de largo', () => {
    const f = leerFiltrosActivos(new URLSearchParams(`marca=Dell&licencia=&so=${'x'.repeat(300)}`));
    expect(f.datos).toEqual({ marca: 'Dell', so: 'x'.repeat(100) });
  });
});
