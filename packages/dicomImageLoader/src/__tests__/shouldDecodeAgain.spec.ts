import { shouldDecodeAgain } from '../imageLoader/wadors/loadImage';

/**
 * Replays a frame arriving in fixed size network chunks and counts how many
 * times it would be decoded, which is the cost this brake exists to bound.
 */
function countDecodes({
  totalBytes,
  chunkBytes,
  decodeLevel = 0,
}: {
  totalBytes: number;
  chunkBytes: number;
  decodeLevel?: number;
}) {
  let decodes = 0;
  let lastDecodeLevel = 10;
  let lastDecodedLength = 0;

  for (let encodedLength = chunkBytes; ; encodedLength += chunkBytes) {
    const done = encodedLength >= totalBytes;
    const length = done ? totalBytes : encodedLength;

    if (
      shouldDecodeAgain({
        done,
        decodeLevel,
        lastDecodeLevel,
        encodedLength: length,
        lastDecodedLength,
      })
    ) {
      decodes++;
      lastDecodeLevel = decodeLevel;
      lastDecodedLength = length;
    }

    if (done) {
      break;
    }
  }

  return decodes;
}

describe('shouldDecodeAgain', () => {
  it('always decodes a finished frame, however little it grew', () => {
    expect(
      shouldDecodeAgain({
        done: true,
        decodeLevel: 0,
        lastDecodeLevel: 0,
        encodedLength: 1001,
        lastDecodedLength: 1000,
      })
    ).toBe(true);
  });

  it('decodes whenever the sub-resolution level improves', () => {
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 1,
        lastDecodeLevel: 2,
        encodedLength: 1000,
        lastDecodedLength: 1000,
      })
    ).toBe(true);
  });

  it('skips a sub-resolution decode that would repeat the same level', () => {
    // Pinned pre-existing behavior: at a sub-resolution level, more bytes at
    // the same level are not on their own a reason to decode again.
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 2,
        lastDecodeLevel: 2,
        encodedLength: 10000,
        lastDecodedLength: 1000,
      })
    ).toBe(false);
  });

  it('repeats a full resolution decode once the codestream grows by half', () => {
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 0,
        lastDecodeLevel: 0,
        encodedLength: 1500,
        lastDecodedLength: 1000,
      })
    ).toBe(true);
  });

  it('holds off a full resolution decode while the growth is marginal', () => {
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 0,
        lastDecodeLevel: 0,
        encodedLength: 1400,
        lastDecodedLength: 1000,
      })
    ).toBe(false);
  });

  it('decodes the first chunk, when nothing has been decoded yet', () => {
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 0,
        lastDecodeLevel: 10,
        encodedLength: 32 * 1024,
        lastDecodedLength: 0,
      })
    ).toBe(true);
  });

  it('keeps a large frame to a handful of decodes instead of one per chunk', () => {
    // An 8MB frame over 128k streaming reads is 64 chunks. Without the growth
    // brake this decoded 64 times; the bound is what the brake buys.
    const chunks = Math.ceil((8 * 1024 * 1024) / (128 * 1024));

    expect(chunks).toBe(64);
    expect(
      countDecodes({ totalBytes: 8 * 1024 * 1024, chunkBytes: 128 * 1024 })
    ).toBeLessThanOrEqual(12);
  });

  it('still refines a small frame that arrives in a couple of chunks', () => {
    // The 185k test frame over 128k reads: first chunk, then the rest.
    expect(
      countDecodes({ totalBytes: 185 * 1024, chunkBytes: 128 * 1024 })
    ).toBe(2);
  });
});
