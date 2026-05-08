/**
 *
 * @description Creates a SHA-256 hash of the given image's pixel data.
 * This can be used to verify that the pixel data matches an expected value.
 *
 * @param {ArrayBufferLike} image
 * @returns {Promise<string>}
 */
export async function createImageHash(
  image: BufferSource
): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    image
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}
