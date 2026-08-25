import {
  MAX_SIGNATURE_BYTES,
  pngSignatureSchema,
} from '@/lib/validations/signature';
import { FIRMA_VALIDA, pngDeUnPixel, pngSinDatosDeImagen, pngValido } from '@/test-utils/signature';

const PNG_SIGNATURE = FIRMA_VALIDA;

describe('pngSignatureSchema', () => {
  test('acepta un PNG base64 real y conserva su data URL', () => {
    const result = pngSignatureSchema.safeParse(PNG_SIGNATURE);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(PNG_SIGNATURE);
  });

  test.each([
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD',
    'data:image/png;base64,no-es-base64***',
    'data:image/png;base64,AAECAwQ=',
    'not-a-data-url',
  ])('rechaza una firma que no es un PNG base64 válido: %s', (firma) => {
    expect(pngSignatureSchema.safeParse(firma).success).toBe(false);
  });

  test.each([
    // Tiene la cabecera correcta, pero no tiene IHDR ni IEND.
    'data:image/png;base64,iVBORw0KGgo=',
    // IHDR debe ser el primer chunk; aquí IEND viene primero.
    'data:image/png;base64,iVBORw0KGgoAAAAASUVORAAAAAAA',
    // Los bits no utilizados del último byte hacen que esta codificación no sea canónica.
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3phAAAABJRU5ErkJggg==',
  ])('rechaza PNG truncado, con chunks inválidos o base64 no canónico: %s', (firma) => {
    expect(pngSignatureSchema.safeParse(firma).success).toBe(false);
  });

  /**
   * `IHDR` declara el tamaño y `IEND` cierra el archivo; los píxeles viven en
   * los chunks `IDAT`, que la especificación PNG exige y este validador no
   * pedía. Sin ellos, ~60 bytes de estructura bastaban para satisfacer el
   * control de firma: el acta se emitía y el visor no dibujaba nada.
   */
  test('rechaza un PNG estructuralmente correcto pero sin datos de imagen', () => {
    expect(pngSignatureSchema.safeParse(pngSinDatosDeImagen()).success).toBe(false);
  });

  test('rechaza un PNG de un solo píxel: es un token, no una firma', () => {
    expect(pngSignatureSchema.safeParse(pngDeUnPixel()).success).toBe(false);
  });

  test('acepta el tamaño mínimo declarado y rechaza el inmediatamente inferior', () => {
    expect(pngSignatureSchema.safeParse(pngValido(64, 32)).success).toBe(true);
    expect(pngSignatureSchema.safeParse(pngValido(63, 32)).success).toBe(false);
    expect(pngSignatureSchema.safeParse(pngValido(64, 31)).success).toBe(false);
  });

  test('rechaza una firma PNG que excede el límite conservador', () => {
    const oversizedPng = `data:image/png;base64,${'iVBORw0KGgo'.padEnd(
      Math.ceil((MAX_SIGNATURE_BYTES + 1) / 3) * 4,
      'A'
    )}`;

    expect(pngSignatureSchema.safeParse(oversizedPng).success).toBe(false);
  });

  test('rechaza una firma comprimida cuya superficie declarada excede cuatro millones de píxeles', () => {
    expect(pngSignatureSchema.safeParse(pngValido(2_001, 2_000)).success).toBe(false);
  });
});
