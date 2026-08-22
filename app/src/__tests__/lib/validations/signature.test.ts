import {
  MAX_SIGNATURE_BYTES,
  pngSignatureSchema,
} from '@/lib/validations/signature';

const PNG_SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3pgAAAABJRU5ErkJggg==';

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

  test('rechaza una firma PNG que excede el límite conservador', () => {
    const oversizedPng = `data:image/png;base64,${'iVBORw0KGgo'.padEnd(
      Math.ceil((MAX_SIGNATURE_BYTES + 1) / 3) * 4,
      'A'
    )}`;

    expect(pngSignatureSchema.safeParse(oversizedPng).success).toBe(false);
  });
});
