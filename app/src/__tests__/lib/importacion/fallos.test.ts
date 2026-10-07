import { AYUDA_FALLOS, aCsv, agruparFallos, fallosParaCsv, textoDeFilas } from '@/modules/importacion';

// SPEC 2.133: los fallos de una importación se agrupan por motivo y dicen cómo arreglarse.
describe('agrupar los fallos', () => {
  const fallos = [
    { fila: 5, mensaje: 'Marca no reconocida: "Xiaomi". Selecciona una opción del catálogo o créala.' },
    { fila: 9, mensaje: 'Marca no reconocida: "Honor". Selecciona una opción del catálogo o créala.' },
    { fila: 3, mensaje: 'El IMEI no es válido: revisa los números' },
    { fila: 12, mensaje: 'Marca no reconocida: "Xiaomi". Selecciona una opción del catálogo o créala.' },
    { fila: 20, mensaje: 'Algo raro que no conocemos 123' },
    { fila: 21, mensaje: 'Algo raro que no conocemos 456' },
  ];

  test('una marca distinta en varias filas es un solo motivo, con sus filas y cómo arreglarlo', () => {
    const grupos = agruparFallos(fallos);
    expect(grupos[0]).toMatchObject({ titulo: 'Marca que no está en el catálogo', cantidad: 3, filas: [5, 9, 12] });
    expect(grupos[0].solucion).toMatch(/Activos › Catálogos › Marcas/);
  });

  test('van del motivo que afecta a más filas al que afecta a menos', () => {
    expect(agruparFallos(fallos).map((g) => [g.titulo, g.cantidad])).toEqual([
      ['Marca que no está en el catálogo', 3],
      ['Algo raro que no conocemos 123', 2],
      ['IMEI inválido', 1],
    ]);
  });

  test('un mensaje que no se conoce se agrupa por su forma (sin los números) y no tiene solución inventada', () => {
    const g = agruparFallos(fallos).find((x) => x.cantidad === 2)!;
    expect(g.solucion).toBeUndefined();
    expect(g.filas).toEqual([20, 21]);
  });

  test('cada motivo conocido calza con el mensaje real que escribe el importador', () => {
    const mensajes: Record<string, string> = {
      'IMEI inválido': 'El IMEI no es válido: revisa los números',
      'Equipo que ya existe en el sistema': 'Ya existe un activo con el IMEI 356938035643809',
      'Repetido dentro del archivo': 'IMEI "356938035643809" aparece repetido en este mismo archivo (otra fila ya lo usa).',
      'Faltan datos obligatorios': 'Campos faltantes: Marca, Modelo',
      'RUT con dígito verificador incorrecto': 'RUT inválido: "12.345.678-0" (dígito verificador incorrecto)',
      'Equipo asignado a una persona desvinculada': 'La persona de la fila (12.345.678-9) está desvinculada: usa el estado "No devuelto" o quita a la persona',
      'Sede que no existe': 'Sede no reconocida: "Marte". Corrige la columna Sede o selecciona la sede manualmente.',
      'Nombre que coincide con varias personas': 'Ana Pérez calza con 2 personas del sistema: agrega su RUT',
      'Estado no reconocido': 'Estado no reconocido: "Roto". Se espera un estado (Disponible, Asignado)',
      'Equipo que todavía no está importado': 'No hay un equipo con el IMEI 356938035643809 en el sistema: importa primero los equipos',
      'Persona sin datos para crearla': 'Ana Pérez no está en el sistema ni en la hoja PERSONAS del archivo',
      'Número de línea inválido': '"12345" no es un celular de 9 dígitos',
    };
    for (const [titulo, mensaje] of Object.entries(mensajes)) {
      expect(agruparFallos([{ fila: 2, mensaje }])[0].titulo).toBe(titulo);
    }
    // Todos los motivos del catálogo de ayuda tienen su solución.
    expect(AYUDA_FALLOS.every((a) => a.solucion.length > 10 && a.titulo.length > 5)).toBe(true);
  });
});

describe('textos y CSV', () => {
  test('las filas se nombran en español', () => {
    expect(textoDeFilas([7])).toBe('Fila 7');
    expect(textoDeFilas([20, 3, 12])).toBe('Filas 3, 12 y 20');
    expect(textoDeFilas([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe('Filas 1, 2, 3, 4, 5, 6 y 3 más');
  });

  test('el CSV abre bien en Excel en español: ";", comillas escapadas, tildes con BOM y filas en orden', () => {
    const csv = aCsv(fallosParaCsv([
      { fila: 9, mensaje: 'IMEI "x"; mal', referencia: '35693' },
      { fila: 2, mensaje: 'El IMEI no es válido: revisa los números' },
    ]));
    expect(csv.startsWith('﻿Fila del Excel;Motivo;Cómo arreglarlo;Mensaje;Referencia')).toBe(true);
    const lineas = csv.split('\r\n');
    expect(lineas[1].startsWith('2;IMEI inválido;')).toBe(true);
    expect(lineas[2]).toBe('9;;;"IMEI ""x""; mal";35693');
  });

  test('un valor que parece fórmula (=, +, -, @) sale como texto, no se ejecuta al abrir el CSV', () => {
    const csv = aCsv([['=HYPERLINK("http://x")', '+56 9', '-3', '@SUMA(A1)', 'normal']]);
    expect(csv.slice(1)).toBe(`"'=HYPERLINK(""http://x"")";'+56 9;'-3;'@SUMA(A1);normal`);
  });
});
