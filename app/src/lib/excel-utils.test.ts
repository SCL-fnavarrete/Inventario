import {
  excelSerialToDate,
  formatDateToDDMMYYYY,
  excelSerialToDDMMYYYY,
  isExcelDateSerial,
  convertExcelDateValue,
  parseDDMMYYYYToDate,
} from './excel-utils';

describe('excelSerialToDate', () => {
  test('convierte serial 45015 a 30-03-2023', () => {
    const date = excelSerialToDate(45015);
    expect(date.getUTCFullYear()).toBe(2023);
    expect(date.getUTCMonth()).toBe(2); // marzo = 2
    expect(date.getUTCDate()).toBe(30);
  });

  test('convierte serial 43831 a 01-01-2020', () => {
    const date = excelSerialToDate(43831);
    expect(date.getUTCFullYear()).toBe(2020);
    expect(date.getUTCMonth()).toBe(0); // enero = 0
    expect(date.getUTCDate()).toBe(1);
  });
});

describe('formatDateToDDMMYYYY', () => {
  test('formatea fecha a dd-mm-yyyy', () => {
    const date = excelSerialToDate(45015);
    expect(formatDateToDDMMYYYY(date)).toBe('30-03-2023');
  });
});

describe('excelSerialToDDMMYYYY', () => {
  test('convierte serial 45015 directamente a 30-03-2023', () => {
    expect(excelSerialToDDMMYYYY(45015)).toBe('30-03-2023');
  });

  test('convierte serial 43831 a 01-01-2020', () => {
    expect(excelSerialToDDMMYYYY(43831)).toBe('01-01-2020');
  });
});

describe('isExcelDateSerial', () => {
  test('detecta 45015 como serial de fecha válido', () => {
    expect(isExcelDateSerial(45015)).toBe(true);
  });

  test('detecta 44000 como serial de fecha válido', () => {
    expect(isExcelDateSerial(44000)).toBe(true);
  });

  test('rechaza 100 como serial (fuera de rango)', () => {
    expect(isExcelDateSerial(100)).toBe(false);
  });

  test('rechaza string como serial', () => {
    expect(isExcelDateSerial('texto')).toBe(false);
  });

  test('rechaza 60000 como serial (muy futuro)', () => {
    expect(isExcelDateSerial(60000)).toBe(false);
  });
});

describe('convertExcelDateValue', () => {
  test('convierte serial numérico a dd-mm-yyyy', () => {
    expect(convertExcelDateValue(45015)).toBe('30-03-2023');
  });

  test('convierte string ISO a dd-mm-yyyy', () => {
    expect(convertExcelDateValue('2023-04-19')).toContain('19-04-2023');
  });

  test('mantiene formato dd-mm-yyyy si ya está en ese formato', () => {
    expect(convertExcelDateValue('19-04-2023')).toBe('19-04-2023');
  });

  test('normaliza dd/mm/yyyy con barras a dd-mm-yyyy', () => {
    expect(convertExcelDateValue('01/12/2024')).toBe('01-12-2024');
  });

  test('rellena dia y mes de un digito', () => {
    expect(convertExcelDateValue('1/4/2023')).toBe('01-04-2023');
  });

  test('convierte número pequeño (no serial) a string', () => {
    expect(convertExcelDateValue(123)).toBe('123');
  });
});

describe('parseDDMMYYYYToDate', () => {
  test('parsea 19-04-2023 correctamente', () => {
    const date = parseDDMMYYYYToDate('19-04-2023');
    expect(date).not.toBeNull();
    expect(date?.getUTCFullYear()).toBe(2023);
    expect(date?.getUTCMonth()).toBe(3); // abril = 3
    expect(date?.getUTCDate()).toBe(19);
  });

  test('retorna null para string inválido', () => {
    expect(parseDDMMYYYYToDate('fecha-invalida')).toBeNull();
  });

  // Formato chileno con barras: es como la mayoria de los Excel muestran la
  // fecha cuando la celda es texto. Antes se perdia en silencio.
  test('parsea 01/12/2024 con barras como 1 de diciembre', () => {
    const date = parseDDMMYYYYToDate('01/12/2024');
    expect(date).not.toBeNull();
    expect(date?.getUTCFullYear()).toBe(2024);
    expect(date?.getUTCMonth()).toBe(11); // diciembre = 11
    expect(date?.getUTCDate()).toBe(1);
  });

  // El caso que probamos a mano y salia mal: con new Date() se leia como
  // 12 de enero, porque interpretaba mes/dia al estilo estadounidense.
  test('31/12/2024 no se pierde', () => {
    const date = parseDDMMYYYYToDate('31/12/2024');
    expect(date).not.toBeNull();
    expect(date?.getUTCMonth()).toBe(11);
    expect(date?.getUTCDate()).toBe(31);
  });

  test('acepta dia y mes de un solo digito', () => {
    const date = parseDDMMYYYYToDate('1-4-2023');
    expect(date?.getUTCMonth()).toBe(3);
    expect(date?.getUTCDate()).toBe(1);
  });
});
