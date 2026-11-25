import { describe, it, expect } from '@jest/globals';
import { readFromUnpackedChunks } from '../src/adapters/Cornerstone/Segmentation_4X';

/**
 * Builds subarray-view chunks that all share ONE backing buffer, exactly like
 * chunkPixelData in the labelmap load path. This is where the byteOffset bug
 * bit: chunk N's `.buffer` is the whole shared buffer (byte 0 = chunk 0), so a
 * view built from a chunk-relative offset read chunk 0's bytes instead of
 * chunk N's, corrupting every chunk after the first.
 */
function makeSharedSubarrayChunks(bytes, chunkSize) {
  const full = Uint8Array.from(bytes);
  const chunks = [];
  for (let offset = 0; offset < full.length; offset += chunkSize) {
    chunks.push(full.subarray(offset, offset + chunkSize));
  }
  return chunks;
}

describe('readFromUnpackedChunks (shared-buffer subarray chunks)', () => {
  // values 1..12 split into [1,2,3,4] [5,6,7,8] [9,10,11,12]
  const data = Array.from({ length: 12 }, (_, i) => i + 1);
  const chunks = makeSharedSubarrayChunks(data, 4);

  it('reads a range fully inside a later chunk (previously corrupted to chunk 0)', () => {
    // Global bytes 8..10 live in chunk index 2; must be [9,10,11], not [1,2,3].
    const view = readFromUnpackedChunks(chunks, 8, 3);
    expect(Array.from(view)).toEqual([9, 10, 11]);
  });

  it('reads a range spanning multiple later chunks', () => {
    // Global bytes 5..9 span chunk 1 and chunk 2 -> [6,7,8,9,10].
    const view = readFromUnpackedChunks(chunks, 5, 5);
    expect(Array.from(view)).toEqual([6, 7, 8, 9, 10]);
  });

  it('reads the first chunk correctly (unchanged behavior)', () => {
    const view = readFromUnpackedChunks(chunks, 0, 3);
    expect(Array.from(view)).toEqual([1, 2, 3]);
  });
});
