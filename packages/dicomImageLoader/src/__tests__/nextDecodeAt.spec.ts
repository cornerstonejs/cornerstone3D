import { nextDecodeAt } from '../imageLoader/internal/streamRequest';

const INITIAL_CHUNK_SIZE = 32768;
const CHUNK_SIZE = 131072;

/**
 * Replays a streaming response arriving in fixed reads and returns the byte
 * count held at each decode, which is what the two sizes exist to control.
 */
function decodeSizes({
  totalBytes,
  readBytes,
  initialChunkSize = INITIAL_CHUNK_SIZE,
  chunkSize = CHUNK_SIZE,
}: {
  totalBytes: number;
  readBytes: number;
  initialChunkSize?: number;
  chunkSize?: number;
}) {
  const sizes: number[] = [];
  let lastSize = 0;

  for (
    let received = readBytes;
    ;
    received = Math.min(received + readBytes, totalBytes)
  ) {
    const readDone = received >= totalBytes;

    if (
      readDone ||
      received >= nextDecodeAt(lastSize, initialChunkSize, chunkSize)
    ) {
      sizes.push(received);
      lastSize = received;
    }

    if (readDone) {
      break;
    }
  }

  return sizes;
}

describe('nextDecodeAt', () => {
  it('waits for the initial size before the first decode', () => {
    expect(nextDecodeAt(0, INITIAL_CHUNK_SIZE, CHUNK_SIZE)).toBe(32768);
  });

  it('waits for a full chunk on top of what was already decoded', () => {
    expect(nextDecodeAt(32768, INITIAL_CHUNK_SIZE, CHUNK_SIZE)).toBe(
      32768 + 131072
    );
  });

  it('decodes the first image from the initial size rather than a full chunk', () => {
    // The point of the separate size: a 16k read puts an image up at 32k,
    // where waiting for chunkSize would show nothing until 128k.
    expect(decodeSizes({ totalBytes: 1024 * 1024, readBytes: 16384 })[0]).toBe(
      32768
    );
  });

  it('refines at chunkSize once the first image is up', () => {
    const sizes = decodeSizes({ totalBytes: 1024 * 1024, readBytes: 16384 });

    expect(sizes.slice(0, 3)).toEqual([32768, 32768 + 131072, 32768 + 262144]);
  });

  it('always decodes the completed frame, however little arrived since', () => {
    const totalBytes = 40000;
    const sizes = decodeSizes({ totalBytes, readBytes: 16384 });

    // 32768 puts the first image up, then the frame completes 7232 bytes
    // later - far short of a chunk, and decoded anyway.
    expect(sizes).toEqual([32768, totalBytes]);
  });

  it('honours an explicit initial size', () => {
    expect(
      decodeSizes({
        totalBytes: 1024 * 1024,
        readBytes: 4096,
        initialChunkSize: 8192,
      })[0]
    ).toBe(8192);
  });
});
