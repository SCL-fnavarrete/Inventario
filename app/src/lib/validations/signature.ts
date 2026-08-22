import { z } from 'zod';

/** The stored image is evidence, not an upload. Keep its maximum deliberately small. */
export const MAX_SIGNATURE_BYTES = 256 * 1024;

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]*={0,2})$/;
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_PNG_DIMENSION = 10_000;

/**
 * Un lienzo de firma real mide cientos de píxeles de lado; `SignaturePad`
 * emite 300×150 multiplicado por el device pixel ratio. El piso queda muy por
 * debajo de eso para no rechazar nunca una firma legítima, y muy por encima de
 * un 1×1, que es lo que se cuela si sólo se valida la estructura.
 */
const MIN_PNG_WIDTH = 64;
const MIN_PNG_HEIGHT = 32;

function isCompletePng(bytes: Buffer): boolean {
  if (bytes.length < 8 || PNG_HEADER.some((byte, index) => bytes[index] !== byte)) return false;

  let offset = 8;
  let chunkIndex = 0;
  let sawIend = false;
  let sawIdat = false;

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
      if (width < MIN_PNG_WIDTH || height < MIN_PNG_HEIGHT) return false;
      if (width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION) return false;
    } else if (type === 'IHDR') {
      return false;
    }

    if (type === 'IDAT') {
      if (length === 0) return false;
      sawIdat = true;
    }

    if (type === 'IEND') {
      if (length !== 0 || nextOffset !== bytes.length) return false;
      sawIend = true;
      break;
    }

    offset = nextOffset;
    chunkIndex += 1;
  }

  // Los píxeles viven en los chunks IDAT. Sin al menos uno el archivo no es un
  // PNG válido y, sobre todo, no hay imagen: era la forma de satisfacer el
  // control de firma con ~60 bytes de pura estructura.
  return sawIend && sawIdat;
}

/**
 * Validates the exact format emitted by SignaturePad. It rejects loosely
 * decoded base64, truncated images, PNGs that only borrow the file header, and
 * PNGs that carry no image data at all.
 *
 * Known limit, deliberately not covered here: a correctly formed PNG of the
 * right size whose pixels are all transparent still passes. Proving there is
 * ink would mean inflating the IDAT stream and counting opaque pixels. The
 * control asserts "this is a real image of the expected shape", not "somebody
 * signed"; SPEC 2.1 quinquies states it in those terms so the guarantee is not
 * read as stronger than it is.
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
