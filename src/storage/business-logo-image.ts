export interface ValidatedImage {
  readonly contentType: "image/jpeg" | "image/png" | "image/webp";
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 2048;

const ascii = (bytes: Uint8Array, offset: number, value: string): boolean =>
  [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));

const u16be = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] << 8) | bytes[offset + 1];

const u24le = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const u32be = (bytes: Uint8Array, offset: number): number =>
  (((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0);

const u32le = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;

function dimensionsPng(bytes: Uint8Array): [number, number] {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || !signature.every((value, index) => bytes[index] === value)) {
    throw new Error("Business logo is not a valid PNG signature");
  }
  if (u32be(bytes, 8) !== 13 || !ascii(bytes, 12, "IHDR")) throw new Error("Business logo PNG header is invalid");
  if (u32le(bytes, bytes.length - 12) !== 0 || !ascii(bytes, bytes.length - 8, "IEND")) {
    throw new Error("Business logo PNG is incomplete");
  }
  return [u32be(bytes, 16), u32be(bytes, 20)];
}

function dimensionsJpeg(bytes: Uint8Array): [number, number] {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error("Business logo is not a complete JPEG image");
  }
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset < bytes.length - 4) {
    if (bytes[offset] !== 0xff) throw new Error("Business logo JPEG marker stream is invalid");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = u16be(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) throw new Error("Business logo JPEG segment is invalid");
    if (startOfFrame.has(marker)) {
      if (segmentLength < 7) throw new Error("Business logo JPEG frame header is invalid");
      return [u16be(bytes, offset + 5), u16be(bytes, offset + 3)];
    }
    offset += segmentLength;
  }
  throw new Error("Business logo JPEG dimensions could not be read");
}

function dimensionsWebp(bytes: Uint8Array): [number, number] {
  if (bytes.length < 30 || !ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP") || u32le(bytes, 4) + 8 !== bytes.length) {
    throw new Error("Business logo is not a complete WebP image");
  }
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  const chunkLength = u32le(bytes, 16);
  if (20 + chunkLength > bytes.length) throw new Error("Business logo WebP chunk is incomplete");
  if (chunk === "VP8X") {
    if (chunkLength < 10) throw new Error("Business logo WebP extended header is invalid");
    if ((bytes[20] & 0x02) !== 0) throw new Error("Animated Business logos are not supported");
    return [u24le(bytes, 24) + 1, u24le(bytes, 27) + 1];
  }
  if (chunk === "VP8 ") {
    if (chunkLength < 10 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      throw new Error("Business logo WebP frame header is invalid");
    }
    return [((bytes[27] & 0x3f) << 8) | bytes[26], ((bytes[29] & 0x3f) << 8) | bytes[28]];
  }
  if (chunk === "VP8L") {
    if (chunkLength < 5 || bytes[20] !== 0x2f) throw new Error("Business logo WebP lossless header is invalid");
    const width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
    const height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6));
    return [width, height];
  }
  throw new Error("Unsupported Business logo WebP encoding");
}

export function validateBusinessLogoBytes(bytes: Uint8Array, contentType: string): ValidatedImage {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error("Business logo file is empty");
  if (bytes.length > MAX_BYTES) throw new Error("Business logo exceeds the 2 MB limit");
  let dimensions: [number, number];
  if (contentType === "image/png") dimensions = dimensionsPng(bytes);
  else if (contentType === "image/jpeg") dimensions = dimensionsJpeg(bytes);
  else if (contentType === "image/webp") dimensions = dimensionsWebp(bytes);
  else throw new Error("Unsupported Business logo content type");
  const [width, height] = dimensions;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error("Business logo dimensions are invalid");
  }
  if (Math.max(width, height) > MAX_EDGE) throw new Error("Business logo longest edge must not exceed 2048 pixels");
  return { contentType: contentType as ValidatedImage["contentType"], width, height, byteSize: bytes.length };
}
