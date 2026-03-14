// @TheTechMargin 2026
// dHash perceptual hashing via sharp for duplicate detection.

import sharp from "sharp";

/**
 * Compute a 64-bit difference hash (dHash) from an image buffer.
 *
 * Resizes to 9x8 grayscale, compares adjacent horizontal pixels to produce
 * a 64-bit hash. Hamming distance <= 10 indicates near-duplicate images.
 *
 * Returns a signed 64-bit BigInt compatible with PostgreSQL's bigint type.
 */
export async function computeDhash(imageBuffer: Buffer): Promise<bigint> {
  const pixels = await sharp(imageBuffer)
    .grayscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = pixels[y * 9 + x];
      const right = pixels[y * 9 + x + 1];
      if (left > right) {
        hash |= 1n << BigInt(y * 8 + x);
      }
    }
  }

  // Convert to signed 64-bit for PostgreSQL bigint
  if (hash >= 1n << 63n) {
    hash -= 1n << 64n;
  }

  return hash;
}

/**
 * Compute dHash from base64-encoded image data.
 */
export async function computeDhashFromBase64(base64Data: string): Promise<bigint> {
  const buffer = Buffer.from(base64Data, "base64");
  return computeDhash(buffer);
}
