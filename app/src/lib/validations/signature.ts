import { z } from 'zod';

/** The stored image is evidence, not an upload. Keep its maximum deliberately small. */
export const MAX_SIGNATURE_BYTES = 256 * 1024;

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Validates the exact format emitted by SignaturePad. This does not accept an
 * arbitrary image data URL: it must be a complete, bounded PNG payload.
 */
export const pngSignatureSchema = z.string().superRefine((value, ctx) => {
  const match = PNG_DATA_URL.exec(value);
  if (!match || match[1].length % 4 !== 0) {
    ctx.addIssue({ code: 'custom', message: 'La firma debe ser un PNG base64 válido' });
    return;
  }

  const encoded = match[1];
  const estimatedBytes = (encoded.length / 4) * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (estimatedBytes > MAX_SIGNATURE_BYTES) {
    ctx.addIssue({ code: 'custom', message: 'La firma excede el tamaño permitido' });
    return;
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.length === 0 ||
    bytes.length > MAX_SIGNATURE_BYTES ||
    PNG_HEADER.some((byte, index) => bytes[index] !== byte)
  ) {
    ctx.addIssue({ code: 'custom', message: 'La firma debe contener un PNG válido' });
  }
});

export const policyAcceptanceSchema = z.literal(true, {
  error: 'Debe aceptar la política de uso para registrar evidencia oficial',
});

export type OfficialDeliveryEvidence = {
  firmaEmpleadoEntrega: z.infer<typeof pngSignatureSchema>;
  aceptaPoliticaUso: true;
};

export type OfficialReturnEvidence = {
  firmaEmpleadoDevolucion: z.infer<typeof pngSignatureSchema>;
  aceptaPoliticaUso: true;
};
