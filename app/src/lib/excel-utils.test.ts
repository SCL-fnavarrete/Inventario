/**
 * Pruebas para las funciones de conversión de fechas de Excel
 *
 * Para ejecutar: npm test excel-utils.test.ts
 * O manualmente con Node.js para verificación rápida
 */

import {
  excelSerialToDate,
  formatDateToDDMMYYYY,
  excelSerialToDDMMYYYY,
  isExcelDateSerial,
  convertExcelDateValue,
  parseDDMMYYYYToDate
} from './excel-utils';

// Función auxiliar para pruebas
function testCase(description: string, result: boolean) {
  console.log(`${result ? '✓' : '✗'} ${description}`);
  if (!result) {
    throw new Error(`Test failed: ${description}`);
  }
}

// Test 1: Conversión de serial de Excel a Date
console.log('\n=== Test 1: excelSerialToDate ===');
const date1 = excelSerialToDate(45015);
testCase('45015 debería convertirse a fecha correcta', date1.getUTCFullYear() === 2023);
testCase('45015 debería ser marzo (mes 2)', date1.getUTCMonth() === 2);
testCase('45015 debería ser día 30', date1.getUTCDate() === 30);
console.log(`Serial 45015 = ${date1.toISOString()}`);

// Test 2: Formato dd-mm-yyyy
console.log('\n=== Test 2: formatDateToDDMMYYYY ===');
const formatted = formatDateToDDMMYYYY(date1);
testCase('Formato debería ser dd-mm-yyyy', formatted === '30-03-2023');
console.log(`Fecha formateada: ${formatted}`);

// Test 3: Conversión directa de serial a dd-mm-yyyy
console.log('\n=== Test 3: excelSerialToDDMMYYYY ===');
const direct = excelSerialToDDMMYYYY(45015);
testCase('Conversión directa 45015 -> 30-03-2023', direct === '30-03-2023');
console.log(`Conversión directa: ${direct}`);

// Test 4: Detección de seriales de fecha
console.log('\n=== Test 4: isExcelDateSerial ===');
testCase('45015 debería ser detectado como serial de fecha', isExcelDateSerial(45015));
testCase('44000 debería ser detectado como serial de fecha', isExcelDateSerial(44000));
testCase('100 NO debería ser detectado como serial de fecha', !isExcelDateSerial(100));
testCase('Texto NO debería ser detectado como serial de fecha', !isExcelDateSerial('texto'));
testCase('60000 NO debería ser detectado (muy futuro)', !isExcelDateSerial(60000));

// Test 5: Conversión de valores de Excel variados
console.log('\n=== Test 5: convertExcelDateValue ===');
testCase('Serial 45015 -> 30-03-2023', convertExcelDateValue(45015) === '30-03-2023');
testCase('String ISO -> dd-mm-yyyy', convertExcelDateValue('2023-04-19').startsWith('19-04-2023'));
testCase('Formato dd-mm-yyyy se mantiene', convertExcelDateValue('19-04-2023') === '19-04-2023');
testCase('Número pequeño se convierte a string', convertExcelDateValue(123) === '123');
console.log(`Serial 45015 -> ${convertExcelDateValue(45015)}`);
console.log(`ISO 2023-04-19 -> ${convertExcelDateValue('2023-04-19')}`);

// Test 6: Parseo de dd-mm-yyyy a Date
console.log('\n=== Test 6: parseDDMMYYYYToDate ===');
const parsed = parseDDMMYYYYToDate('19-04-2023');
testCase('19-04-2023 debería parsearse correctamente', parsed !== null);
testCase('Año debería ser 2023', parsed?.getUTCFullYear() === 2023);
testCase('Mes debería ser abril (3)', parsed?.getUTCMonth() === 3);
testCase('Día debería ser 19', parsed?.getUTCDate() === 19);
testCase('String inválido debería retornar null', parseDDMMYYYYToDate('fecha-invalida') === null);
console.log(`Parsed date: ${parsed?.toISOString()}`);

// Test 7: Casos especiales
console.log('\n=== Test 7: Casos Especiales ===');
const date2024 = excelSerialToDDMMYYYY(45000); // Marzo 2023
testCase('Serial 45000 debería convertirse', date2024.length > 0);
console.log(`Serial 45000 -> ${date2024}`);

const date2020 = excelSerialToDDMMYYYY(43831); // 01-01-2020
testCase('Serial 43831 (01-01-2020) debería convertirse', date2020 === '01-01-2020');
console.log(`Serial 43831 -> ${date2020}`);

console.log('\n✓ Todas las pruebas pasaron exitosamente!\n');

// Exportar los tests para que puedan ser ejecutados
export {
  testCase
};
