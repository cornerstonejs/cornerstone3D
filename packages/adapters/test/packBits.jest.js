import { describe, it, expect } from '@jest/globals';
import {
  packBits,
  encodeFrameToRle,
} from '../src/adapters/Cornerstone3D/encodePixelData';

/**
 * PR-2611 item 2g / 6f: PackBits (PS3.5 Annex G) control-byte boundaries and the
 * per-row reset that keeps runs from spanning image rows.
 */

/** Reference PackBits decoder (independent of the encoder). */
function packBitsDecode(encoded, expectedLength) {
  const signed = new Int8Array(encoded.buffer ?? encoded);
  const bytes = new Uint8Array(encoded.buffer ?? encoded);
  const out = [];
  let i = 0;
  while (
    i < signed.length &&
    (expectedLength == null || out.length < expectedLength)
  ) {
    const n = signed[i++];
    if (n >= 0) {
      for (let k = 0; k < n + 1; k++) {
        out.push(bytes[i++]);
      }
    } else if (n >= -127) {
      const value = bytes[i++];
      for (let k = 0; k < -n + 1; k++) {
        out.push(value);
      }
    }
    // n === -128 is a no-op.
  }
  return out;
}

describe('packBits control-byte boundaries', () => {
  it('encodes a replicate run of exactly 128 as a single run (control 129)', () => {
    const samples = new Uint8Array(128).fill(7);
    const encoded = packBits(samples);
    // 257 - 128 = 129, then the value byte.
    expect(Array.from(encoded)).toEqual([129, 7]);
    expect(packBitsDecode(encoded, 128)).toEqual(Array.from(samples));
  });

  it('splits a replicate run of 129 (max run 128 + 1 literal)', () => {
    const samples = new Uint8Array(129).fill(7);
    const encoded = packBits(samples);
    // replicate 128 -> [129, 7]; remaining single -> literal [0, 7].
    expect(Array.from(encoded)).toEqual([129, 7, 0, 7]);
    expect(packBitsDecode(encoded, 129)).toEqual(Array.from(samples));
  });

  it('encodes a literal run of exactly 128 distinct bytes (control 127)', () => {
    const samples = Uint8Array.from({ length: 128 }, (_, i) => i);
    const encoded = packBits(samples);
    expect(encoded[0]).toBe(127); // literalLength - 1
    expect(encoded.length).toBe(129); // 1 control + 128 literals
    expect(packBitsDecode(encoded, 128)).toEqual(Array.from(samples));
  });

  it('never emits the -128 (0x80) no-op control byte', () => {
    // A long run that would tempt a 128-length control encoded as -128.
    const samples = new Uint8Array(400).fill(3);
    const signed = new Int8Array(packBits(samples).buffer);
    expect(Array.from(signed)).not.toContain(-128);
  });
});

describe('packBits per-row reset (Annex G row boundaries)', () => {
  it('does not let a run span a row boundary when rowLength is given', () => {
    const samples = new Uint8Array(8).fill(9); // 2 rows x 4 columns, all identical

    // Whole-segment: one replicate run of 8.
    expect(Array.from(packBits(samples))).toEqual([257 - 8, 9]);

    // Per-row (rowLength 4): two independent replicate runs of 4.
    expect(Array.from(packBits(samples, 4))).toEqual([257 - 4, 9, 257 - 4, 9]);
  });

  it('falls back to whole-segment encoding when rowLength does not divide the segment', () => {
    const samples = new Uint8Array(7).fill(9);
    expect(Array.from(packBits(samples, 4))).toEqual(
      Array.from(packBits(samples))
    );
  });

  it('still round-trips row by row', () => {
    // 3 rows x 5 columns, distinct per-row patterns.
    const rows = [
      [1, 1, 1, 2, 2],
      [0, 0, 0, 0, 0],
      [5, 6, 7, 8, 9],
    ];
    const samples = Uint8Array.from(rows.flat());
    const encoded = packBits(samples, 5);
    expect(packBitsDecode(encoded, samples.length)).toEqual(
      Array.from(samples)
    );
  });
});

describe('encodeFrameToRle padding', () => {
  it('pads each RLE segment to an even byte length', () => {
    // 8-bit single-segment frame whose PackBits output is odd length.
    const frame = Uint8Array.from({ length: 5 }, (_, i) => i); // 5 distinct -> [4,0,1,2,3,4] = 6 bytes (even)
    const frameBytes = encodeFrameToRle(frame, 8, 5);
    const view = new DataView(frameBytes);
    const numSegments = view.getInt32(0, true);
    expect(numSegments).toBe(1);
    const segStart = view.getInt32(4, true);
    const segLength = frameBytes.byteLength - segStart;
    expect(segLength % 2).toBe(0);
  });
});
