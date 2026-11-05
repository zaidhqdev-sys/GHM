import test from "node:test";
import assert from "node:assert/strict";
import { validateBusinessLogoBytes } from "./business-logo-image.js";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(100);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0, 0, 0, 0], 88);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function webpVp8x(width: number, height: number, flags = 0): Uint8Array {
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(bytes.buffer).setUint32(4, 22, true);
  bytes.set([0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58], 8);
  new DataView(bytes.buffer).setUint32(16, 10, true);
  bytes[20] = flags;
  const w = width - 1;
  const h = height - 1;
  bytes[24] = w & 0xff; bytes[25] = (w >> 8) & 0xff; bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff; bytes[28] = (h >> 8) & 0xff; bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

test("logo validator accepts supported JPEG, PNG and WebP signatures with dimensions", () => {
  assert.deepEqual(validateBusinessLogoBytes(png(800, 600), "image/png"), { contentType: "image/png", width: 800, height: 600, byteSize: 100 });
  const jpegResult = validateBusinessLogoBytes(jpeg(640, 480), "image/jpeg");
  assert.equal(jpegResult.width, 640);
  assert.equal(jpegResult.height, 480);
  const webpResult = validateBusinessLogoBytes(webpVp8x(1200, 900), "image/webp");
  assert.equal(webpResult.width, 1200);
  assert.equal(webpResult.height, 900);
});

test("logo validator rejects MIME/signature mismatch and animated WebP", () => {
  assert.throws(() => validateBusinessLogoBytes(png(100, 100), "image/jpeg"), /JPEG/i);
  assert.throws(() => validateBusinessLogoBytes(webpVp8x(100, 100, 0x02), "image/webp"), /Animated/i);
});

test("logo validator rejects empty, oversized and over-dimension images", () => {
  assert.throws(() => validateBusinessLogoBytes(new Uint8Array(), "image/png"), /empty/i);
  assert.throws(() => validateBusinessLogoBytes(new Uint8Array(2 * 1024 * 1024 + 1), "image/png"), /2 MB/i);
  assert.throws(() => validateBusinessLogoBytes(png(2049, 100), "image/png"), /2048 pixels/i);
});
