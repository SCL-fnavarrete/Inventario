import { z } from 'zod';

/** The stored image is evidence, not an upload. Keep its maximum deliberately small. */
export const MAX_SIGNATURE_BYTES = 256 * 1024;

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]*={0,2})$/;
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_PNG_DIMENSION = 10_000;

function isCompletePng(bytes: Buffer): boolean {
  if (bytes.length < 8 || PNG_HEADER.some((byte, index) => bytes[index] !== byte)) return false;

  let offset = 8;
  let chunkIndex = 0;
  let sawIend = false;

  while (offset < bytes.length) {
    if (bytes.length - offset < 12) return false;
    const length = bytes.readUInt32BE(offset);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (length > MAX_SIGNATURE_BYTES || nextOffset > bytes.length || nextOffset < dataOffset) return false;

    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (!/^[A-Za-z]{4}$/.test(type)) return false;
    if (chunkIndex === 0) {
      if (type !== 'IHDR' || length !== 13) return false;
      const width = bytes.readUInt32BE(dataOffset);
      const height = bytes.readUInt32BE(dataOffset + 4);
      if (!width || !height || width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION) return false;
    } else if (type === 'IHDR') {
      return false;
    }

    if (type === 'IEND') {
      if (length !== 0 || nextOffset !== bytes.length) return false;
      sawIend = true;
      break;
    }

    offset = nextOffset;
    chunkIndex += 1;
  }

  return sawIend;
}

/**
 * Validates the exact format emitted by SignaturePad. It rejects loosely
 * decoded base64, truncated images, and PNGs that only borrow the file header.
 */
export const pngSignatureSchema = z.string().superRefine((value, ctx) => {
  const match = PNG_DATA_URL.exec(value);
  if (!match || !match[1] || match[1].length % 4 !== 0) {
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
    bytes.toString('base64') !== encoded ||
    !isCompletePng(bytes)
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
