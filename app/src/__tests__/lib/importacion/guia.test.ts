import { guiaDeActivos, guiaDeHistorial, mapeoSugerido } from '@/modules/importacion';
import { guiaDeLineas, mapeoSugerido as mapeoLineas } from '@/modules/lineas';

// SPEC 2.133: la guía "cómo debe ir el Excel" dice lo que el importador realmente entiende.
describe('guía de equipos', () => {
  test.each(['computador', 'celular', 'monitor', 'periferico', 'generico'])('cada columna que recomienda para %s se reconoce sola', (ficha) => {
    const guia = guiaDeActivos(ficha);
    const columnas = guia.hojas[0].columnas.map((c) => c.columna);
    const mapeo = mapeoSugerido(columnas);
    expect(Object.keys(mapeo).length).toBe(columnas.length);
    // Y nunca una columna para dos campos.
    expect(new Set(Object.values(mapeo)).size).toBe(Object.values(mapeo).length);
  });

  test('el celular se identifica por IMEI y el resto por N° de serie', () => {
    const obligatorias = (f: string) => guiaDeActivos(f).hojas[0].columnas.filter((c) => c.obligatoria).map((c) => c.columna);
    expect(obligatorias('celular')).toEqual(['IMEI', 'Marca', 'Modelo']);
    expect(obligatorias('monitor')).toEqual(['N° Serie', 'Marca', 'Modelo']);
    expect(guiaDeActivos('celular').resumen).toMatch(/IMEI/);
    expect(guiaDeActivos('periferico').resumen).toMatch(/N° de serie/);
  });

  test('las columnas propias de cada categoría solo salen en ella', () => {
    const nombres = (f: string) => guiaDeActivos(f).hojas[0].columnas.map((c) => c.columna);
    expect(nombres('monitor')).toContain('Pulgadas');
    expect(nombres('computador')).toContain('Procesador');
    expect(nombres('periferico')).not.toContain('Pulgadas');
    expect(nombres('periferico')).not.toContain('Procesador');
  });

  test('explica cuándo se crea una persona y qué hace falta antes de importar', () => {
    const g = guiaDeActivos('monitor', 'Monitor');
    expect(g.titulo).toBe('Equipos: Monitor');
    expect(g.reglas.join(' ')).toMatch(/Si no existe se crea: Activa .* Desvinculada/);
    expect(g.antes.join(' ')).toMatch(/Catálogos › Marcas/);
    expect(g.fallos.length).toBeGreaterThan(5);
    expect(g.fallos.every((f) => f.solucion.length > 10)).toBe(true);
    expect(g.archivoPlantilla).toBe('plantilla-importacion-monitor.xlsx');
  });

  test('un nombre de categoría con tildes y espacios da un archivo sin caracteres raros', () => {
    expect(guiaDeActivos('periferico', 'Audífonos').archivoPlantilla).toBe('plantilla-importacion-audifonos.xlsx');
  });
});

describe('guía del historial y de líneas', () => {
  test('el historial pide la hoja ENTREGAS (con IMEI o serie, persona y ¿Actual?) y la hoja PERSONAS', () => {
    const g = guiaDeHistorial();
    expect(g.hojas.map((h) => h.nombre)).toEqual(['ENTREGAS', 'PERSONAS']);
    expect(g.hojas[0].columnas.map((c) => c.columna)).toEqual(expect.arrayContaining(['IMEI', 'N° serie', 'Persona', '¿Actual?']));
    expect(g.hojas[1].columnas.find((c) => c.columna === 'Nombres')?.obligatoria).toBe(true);
    expect(g.antes.join(' ')).toMatch(/Importa primero los equipos/);
  });

  test('cada columna que recomienda para las líneas se reconoce sola, y solo el número es obligatorio', () => {
    const g = guiaDeLineas();
    const columnas = g.hojas[0].columnas;
    const mapeo = mapeoLineas(columnas.map((c) => c.columna));
    expect(Object.keys(mapeo).length).toBe(columnas.length);
    expect(columnas.filter((c) => c.obligatoria).map((c) => c.columna)).toEqual(['N° teléfono']);
  });
});
