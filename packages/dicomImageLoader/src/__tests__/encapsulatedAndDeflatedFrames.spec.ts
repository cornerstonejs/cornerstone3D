import pako from 'pako';

import decodeEncapsulatedUncompressed from '../shared/decoders/decodeEncapsulatedUncompressed';
import decodeDeflatedFrame from '../shared/decoders/decodeDeflatedFrame';
import {
  nativeFrameLength,
  trimToNativeFrame,
} from '../shared/decoders/nativeFrameBytes';

/** A minimal image frame, enough for the native-length maths and decoding. */
function frame(overrides = {}) {
  return {
    rows: 2,
    columns: 2,
    samplesPerPixel: 1,
    bitsAllocated: 16,
    pixelRepresentation: 0,
    ...overrides,
  } as never;
}

/** Little endian bytes for a 2x2 16 bit frame. */
function bytes16(values: number[]) {
  const out = new Uint8Array(values.length * 2);
  new DataView(out.buffer).setUint16(0, values[0], true);
  values.forEach((v, i) => new DataView(out.buffer).setUint16(i * 2, v, true));
  return out;
}

describe('nativeFrameLength', () => {
  it('sizes a 16 bit grayscale frame', () => {
    expect(nativeFrameLength(frame({ rows: 4, columns: 8 }))).toBe(64);
  });

  it('sizes an 8 bit RGB frame by samples per pixel', () => {
    expect(
      nativeFrameLength(
        frame({ rows: 4, columns: 8, samplesPerPixel: 3, bitsAllocated: 8 })
      )
    ).toBe(96);
  });

  it('rounds a bit-packed frame up to whole bytes', () => {
    // 3x3 single bit samples is 9 bits, which occupies 2 bytes.
    expect(
      nativeFrameLength(frame({ rows: 3, columns: 3, bitsAllocated: 1 }))
    ).toBe(2);
  });
});

describe('trimToNativeFrame', () => {
  it('returns the frame unchanged when it is exactly the right size', () => {
    const data = new Uint8Array(8);
    expect(trimToNativeFrame(frame(), data, 'test')).toBe(data);
  });

  it('drops the even-length padding byte an encapsulated fragment carries', () => {
    const padded = new Uint8Array(9);
    const trimmed = trimToNativeFrame(frame(), padded, 'test');
    expect(trimmed.length).toBe(8);
  });

  it('throws on a frame shorter than its pixel data rather than rendering it', () => {
    expect(() => trimToNativeFrame(frame(), new Uint8Array(6), 'ctx')).toThrow(
      /ctx: frame is 6 bytes, expected 8/
    );
  });
});

describe('decodeEncapsulatedUncompressed (1.2.840.10008.1.2.1.98)', () => {
  it('reads the fragment as native little endian pixel data', async () => {
    const imageFrame = frame();
    const result = await decodeEncapsulatedUncompressed(
      imageFrame,
      bytes16([1, 2, 3, 4])
    );

    expect(Array.from(result.pixelData)).toEqual([1, 2, 3, 4]);
  });

  it('ignores the pad byte on an odd length frame', async () => {
    // 3 single-byte samples pad to 4 bytes in the fragment.
    const imageFrame = frame({
      rows: 1,
      columns: 3,
      bitsAllocated: 8,
    });
    const padded = new Uint8Array([10, 20, 30, 0]);

    const result = await decodeEncapsulatedUncompressed(imageFrame, padded);

    expect(Array.from(result.pixelData)).toEqual([10, 20, 30]);
  });

  it('reads signed pixel data according to pixelRepresentation', async () => {
    const imageFrame = frame({ rows: 1, columns: 2, pixelRepresentation: 1 });
    const data = new Uint8Array(4);
    const view = new DataView(data.buffer);
    view.setInt16(0, -300, true);
    view.setInt16(2, 300, true);

    const result = await decodeEncapsulatedUncompressed(imageFrame, data);

    expect(Array.from(result.pixelData)).toEqual([-300, 300]);
  });
});

describe('decodeDeflatedFrame (1.2.840.10008.1.2.8.1)', () => {
  it('inflates a raw deflate frame and reads it as little endian', async () => {
    const imageFrame = frame();
    const deflated = pako.deflateRaw(bytes16([5, 6, 7, 8]));

    const result = await decodeDeflatedFrame(imageFrame, deflated);

    expect(Array.from(result.pixelData)).toEqual([5, 6, 7, 8]);
  });

  it('uses raw deflate, not the zlib wrapper', async () => {
    // A zlib-wrapped stream of the same payload must not decode, otherwise the
    // implementation is not following RFC 1951 as PS3.5 A.4.13 requires.
    const zlibWrapped = pako.deflate(bytes16([5, 6, 7, 8]));

    await expect(decodeDeflatedFrame(frame(), zlibWrapped)).rejects.toThrow(
      /could not inflate/
    );
  });

  it('decodes a frame that is a view onto a larger buffer', async () => {
    // Frames arrive as views into the encapsulated pixel data, not as buffers
    // of their own, so the offset has to be respected.
    const deflated = pako.deflateRaw(bytes16([9, 10, 11, 12]));
    const backing = new Uint8Array(deflated.length + 16);
    backing.set(deflated, 8);
    const view = new Uint8Array(backing.buffer, 8, deflated.length);

    const result = await decodeDeflatedFrame(frame(), view);

    expect(Array.from(result.pixelData)).toEqual([9, 10, 11, 12]);
  });

  it('throws when the inflated frame is too short for the image', async () => {
    const deflated = pako.deflateRaw(new Uint8Array(4));

    await expect(decodeDeflatedFrame(frame(), deflated)).rejects.toThrow(
      /frame is 4 bytes, expected 8/
    );
  });
});
