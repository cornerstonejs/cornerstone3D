import { gzipSync } from 'zlib';
import {
  DecompressionStream as NodeDecompressionStream,
  ReadableStream as NodeReadableStream,
} from 'stream/web';
import { fetchArrayBuffer } from '../src/createNiftiImageIdsAndCacheMetadata';

jest.mock('nifti-reader-js', () => ({
  readHeader: jest.fn(() => ({
    sizeof_hdr: 348,
    dims: [3, 2, 2, 1, 1, 1, 1, 1],
    pixDims: [1, 1, 1, 1, 0, 0, 0, 0],
    datatypeCode: 4,
    numBitsPerVoxel: 16,
    littleEndian: true,
    affine: [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
  })),
}));

jest.mock('@cornerstonejs/core', () => ({
  eventTarget: { addEventListener: jest.fn(), removeEventListener: jest.fn() },
  triggerEvent: jest.fn(),
  utilities: {
    logger: {
      niftiVolumeLoaderLog: {
        getLogger: () => ({
          error: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
        }),
      },
    },
    windowLevel: {
      toWindowLevel: () => ({ windowWidth: 400, windowCenter: 40 }),
    },
    genericMetadataProvider: { add: jest.fn(), addRaw: jest.fn() },
  },
}));

if (!global.ReadableStream) {
  global.ReadableStream = NodeReadableStream;
}
if (!global.DecompressionStream) {
  global.DecompressionStream = NodeDecompressionStream;
}

const originalDecompressionStream = global.DecompressionStream;
const originalFetch = global.fetch;

function mockFetchChunks(chunks) {
  const body = new global.ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => null },
    body,
  });
}

function load(url, onHeader) {
  return fetchArrayBuffer({
    url,
    onProgress: jest.fn(),
    controller: new AbortController(),
    onLoad: jest.fn(),
    onHeader,
  });
}

afterEach(() => {
  global.fetch = originalFetch;
  global.DecompressionStream = originalDecompressionStream;
});

describe('fetchArrayBuffer compression detection', () => {
  it('decompresses gzip data served from a blob URL', async () => {
    const compressed = new Uint8Array(gzipSync(new Uint8Array(600)));
    mockFetchChunks([compressed]);
    const onHeader = jest.fn();

    const result = await load('blob:http://localhost/1f8b-deadbeef', onHeader);

    expect(onHeader).toHaveBeenCalledTimes(1);
    expect(onHeader.mock.calls[0][0]).toMatchObject({
      isValid: true,
      dimensions: [2, 2, 1],
    });
    expect(result.headerInfo).toBeTruthy();
  });

  it('detects gzip when the first chunk is shorter than the magic cookie', async () => {
    const compressed = new Uint8Array(gzipSync(new Uint8Array(600)));
    mockFetchChunks([compressed.slice(0, 1), compressed.slice(1)]);
    const onHeader = jest.fn();

    await load('blob:http://localhost/1f8b-deadbeef', onHeader);

    expect(onHeader).toHaveBeenCalledTimes(1);
    expect(onHeader.mock.calls[0][0]).toMatchObject({ isValid: true });
  });

  it('does not decompress uncompressed data served from a .gz URL', async () => {
    const decompressionCalls = [];
    global.DecompressionStream = function (...args) {
      decompressionCalls.push(args);
      return new originalDecompressionStream(...args);
    };

    mockFetchChunks([new Uint8Array(600)]);
    const onHeader = jest.fn();

    await load('https://example.com/volume.nii.gz', onHeader);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(decompressionCalls).toHaveLength(0);
    expect(onHeader).toHaveBeenCalledTimes(1);
    expect(onHeader.mock.calls[0][0]).toMatchObject({ isValid: true });
  });
});
