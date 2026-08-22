import { deflateSync } from 'zlib';

/**
 * Constructor de PNG para las pruebas de evidencia.
 *
 * Vive fuera de `__tests__` a propósito: el `testMatch` por defecto trata
 * cualquier archivo bajo ese directorio como una suite, y esto no lo es.
 *
 * Los fixtures se generan en vez de venir pegados en base64 para que cada
 * prueba pueda pedir exactamente el defecto que quiere ejercitar —sin IDAT, de
 * un píxel, truncado— y para que la firma válida se parezca a una firma real y
 * no a un píxel de relleno.
 */

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Un chunk PNG es longitud + tipo + datos + CRC de (tipo + datos). */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function ihdr(width: number, height: number): Buffer {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8; // profundidad de bits
  data[9] = 6; // RGBA
  data[10] = 0; // compresión
  data[11] = 0; // filtro
  data[12] = 0; // sin entrelazado
  return chunk('IHDR', data);
}

/** Píxeles RGBA con una diagonal opaca: algo que un visor dibujaría. */
function idat(width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // tipo de filtro
    for (let x = 0; x < width; x += 1) {
      const onStroke = Math.floor((x / width) * height) === y;
      const pixel = rowStart + 1 + x * 4;
      raw[pixel + 3] = onStroke ? 0xff : 0x00; // alfa
    }
  }
  return chunk('IDAT', deflateSync(raw));
}

const IEND = chunk('IEND', Buffer.alloc(0));

function toDataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

/** PNG completo y dibujable de las dimensiones pedidas. */
export function pngValido(width = 300, height = 150): string {
  return toDataUrl(Buffer.concat([PNG_HEADER, ihdr(width, height), idat(width, height), IEND]));
}

/**
 * Estructura impecable —cabecera, IHDR, IEND— y ni un byte de imagen. Es el
 * payload de ~60 bytes con el que se podía satisfacer el control de firma.
 */
export function pngSinDatosDeImagen(width = 300, height = 150): string {
  return toDataUrl(Buffer.concat([PNG_HEADER, ihdr(width, height), IEND]));
}

/** PNG válido pero de un píxel: no es una firma, es un token. */
export function pngDeUnPixel(): string {
  return pngValido(1, 1);
}

/** La firma que usan las pruebas cuando sólo necesitan una evidencia válida. */
export const FIRMA_VALIDA = pngValido();
