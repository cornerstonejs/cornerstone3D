import { shouldDecodeAgain } from '../imageLoader/wadors/loadImage';

const MS_BETWEEN_DECODE = 500;

/**
 * Replays a frame arriving in chunks and counts how many times it would be
 * decoded, which is the cost the throttle exists to bound.
 *
 * `msPerChunk` is how fast the chunks arrive and `msPerDecode` how long a
 * decode takes; both advance the same clock, so a slow decode also delays the
 * chunks behind it, as it would in the real loop.
 */
function countDecodes({
  totalBytes,
  chunkBytes,
  msPerChunk,
  msPerDecode = 0,
  decodeLevel = 0,
  msBetweenDecode = MS_BETWEEN_DECODE,
}: {
  totalBytes: number;
  chunkBytes: number;
  msPerChunk: number;
  msPerDecode?: number;
  decodeLevel?: number;
  msBetweenDecode?: number;
}) {
  let decodes = 0;
  let lastDecodeLevel = 10;
  let lastDecodeTime = 0;
  let now = 0;

  for (
    let encodedLength = chunkBytes;
    ;
    encodedLength = Math.min(encodedLength + chunkBytes, totalBytes)
  ) {
    now += msPerChunk;
    const done = encodedLength >= totalBytes;

    if (
      shouldDecodeAgain({
        done,
        decodeLevel,
        lastDecodeLevel,
        lastDecodeTime,
        now,
        msBetweenDecode,
      })
    ) {
      decodes++;
      now += msPerDecode;
      lastDecodeLevel = decodeLevel;
      lastDecodeTime = now;
    }

    if (done) {
      break;
    }
  }

  return decodes;
}

describe('shouldDecodeAgain', () => {
  it('always decodes a finished frame, however recently the last one ran', () => {
    expect(
      shouldDecodeAgain({
        done: true,
        decodeLevel: 0,
        lastDecodeLevel: 0,
        lastDecodeTime: 1000,
        now: 1001,
        msBetweenDecode: MS_BETWEEN_DECODE,
      })
    ).toBe(true);
  });

  it('decodes the first chunk, when nothing has been decoded yet', () => {
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 0,
        lastDecodeLevel: 10,
        lastDecodeTime: 0,
        now: 5,
        msBetweenDecode: MS_BETWEEN_DECODE,
      })
    ).toBe(true);
  });

  it('holds off a full resolution decode inside the interval', () => {
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 0,
        lastDecodeLevel: 0,
        lastDecodeTime: 1000,
        now: 1499,
        msBetweenDecode: MS_BETWEEN_DECODE,
      })
    ).toBe(false);
  });

  it('repeats a full resolution decode once the interval has passed', () => {
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 0,
        lastDecodeLevel: 0,
        lastDecodeTime: 1000,
        now: 1500,
        msBetweenDecode: MS_BETWEEN_DECODE,
      })
    ).toBe(true);
  });

  it('decodes every chunk when the interval is zero', () => {
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 0,
        lastDecodeLevel: 0,
        lastDecodeTime: 1000,
        now: 1000,
        msBetweenDecode: 0,
      })
    ).toBe(true);
  });

  it('decodes whenever the sub-resolution level improves', () => {
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 1,
        lastDecodeLevel: 2,
        lastDecodeTime: 1000,
        now: 1001,
        msBetweenDecode: MS_BETWEEN_DECODE,
      })
    ).toBe(true);
  });

  it('skips a sub-resolution decode that would repeat the same level, whatever the clock says', () => {
    // Pinned pre-existing behavior: at a sub-resolution level, more bytes at
    // the same level produce the same image, so time does not make it worth
    // redoing.
    expect(
      shouldDecodeAgain({
        done: false,
        decodeLevel: 2,
        lastDecodeLevel: 2,
        lastDecodeTime: 0,
        now: 10000,
        msBetweenDecode: MS_BETWEEN_DECODE,
      })
    ).toBe(false);
  });

  it('keeps a fast large transfer to a few decodes instead of one per chunk', () => {
    // 8MB over 128k chunks is 64 chunks. Arriving at 10ms per chunk the whole
    // frame lands in ~640ms, so the throttle should allow only the first
    // decode, one at the 500ms mark, and the final one.
    const decodes = countDecodes({
      totalBytes: 8 * 1024 * 1024,
      chunkBytes: 128 * 1024,
      msPerChunk: 10,
    });

    expect(decodes).toBeLessThanOrEqual(4);
  });

  it('still refines steadily over a slow transfer', () => {
    // The same frame over a slow link - 200ms per chunk, ~13s in total -
    // should refine roughly every 500ms rather than being starved.
    const decodes = countDecodes({
      totalBytes: 8 * 1024 * 1024,
      chunkBytes: 128 * 1024,
      msPerChunk: 200,
    });

    expect(decodes).toBeGreaterThanOrEqual(20);
    expect(decodes).toBeLessThanOrEqual(32);
  });

  it('decodes a small frame on its first chunk and again at the end', () => {
    // 185k over a 32k initial chunk then 128k chunks: first chunk, then done.
    expect(
      countDecodes({
        totalBytes: 185 * 1024,
        chunkBytes: 128 * 1024,
        msPerChunk: 10,
      })
    ).toBe(2);
  });

  it('does not let a slow decode immediately qualify the next chunk', () => {
    // A 400ms decode plus a 150ms chunk is past the 500ms mark in wall clock,
    // but timing from the end of the decode means the next chunk still waits.
    const decodes = countDecodes({
      totalBytes: 1024 * 1024,
      chunkBytes: 128 * 1024,
      msPerChunk: 150,
      msPerDecode: 400,
    });

    expect(decodes).toBeLessThanOrEqual(4);
  });
});
