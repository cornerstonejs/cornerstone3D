import decodeHTJ2K from '../shared/decoders/decodeHTJ2K';

// Stand-in for the embind decoder: records each instance so the test can
// check that the decode deleted it, and can fail a decode on request.
const mockDecoders: { delete: jest.Mock }[] = [];
const mockState = { failDecode: false };

jest.mock(
  '@cornerstonejs/codec-openjph/wasmjs',
  () => () =>
    Promise.resolve({
      HTJ2KDecoder: class {
        delete = jest.fn();
        constructor() {
          mockDecoders.push(this);
        }
        decodeSubResolution() {
          if (mockState.failDecode) {
            throw new Error('decode failed');
          }
        }
        getEncodedBuffer(length: number) {
          return new Uint8Array(length);
        }
        getFrameInfo() {
          return {
            width: 2,
            height: 2,
            bitsPerSample: 16,
            isSigned: false,
            componentCount: 1,
          };
        }
        getDecodedBuffer() {
          return new Uint8Array(8);
        }
        getImageOffset() {
          return { x: 0, y: 0 };
        }
        getNumDecompositions() {
          return 0;
        }
        getNumLayers() {
          return 1;
        }
        getProgressionOrder() {
          return 0;
        }
        getIsReversible() {
          return true;
        }
        getBlockDimensions() {
          return { width: 64, height: 64 };
        }
        getTileSize() {
          return { width: 2, height: 2 };
        }
        getTileOffset() {
          return { x: 0, y: 0 };
        }
      },
    })
);

describe('decodeHTJ2K', () => {
  beforeEach(() => {
    mockState.failDecode = false;
  });

  it('deletes the decoder it creates for each frame', async () => {
    const frame = new Uint8Array(4);
    const result = await decodeHTJ2K(frame, { bytesPerPixel: 2 });
    await decodeHTJ2K(frame, { bytesPerPixel: 2 });

    // One decoder per frame, each deleted; none is left over from initialize().
    expect(mockDecoders.map((d) => d.delete.mock.calls.length)).toEqual([1, 1]);
    // The pixels are copied out of the WASM heap before the decoder goes.
    expect(result.pixelData).toHaveLength(4);
  });

  it('deletes the decoder when the decode throws', async () => {
    mockState.failDecode = true;

    await expect(
      decodeHTJ2K(new Uint8Array(4), { bytesPerPixel: 2 })
    ).rejects.toThrow('decode failed');
    expect(mockDecoders.at(-1).delete).toHaveBeenCalledTimes(1);
  });
});
