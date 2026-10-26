import { postProcessDecodedPixels } from '../decodeImageFrameWorker';

// The worker imports every decoder, and the WASM ones don't load under jest.
jest.mock('../shared/decoders/decodeJPEGBaseline8Bit', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEGLossless', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEGLS', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEG2000', () => jest.fn());
jest.mock('../shared/decoders/decodeHTJ2K', () => jest.fn());
jest.mock('../shared/decoders/decodeJPEGXL', () => jest.fn());

/** A grayscale frame of the given size, with values 1, 2, 3, ... */
function makeFrame(rows: number, columns: number) {
  return {
    rows,
    columns,
    samplesPerPixel: 1,
    pixelRepresentation: 0,
    photometricInterpretation: 'MONOCHROME2',
    pixelData: Uint16Array.from({ length: rows * columns }, (_, i) => i + 1),
  };
}

function process(frame, targetBuffer) {
  return postProcessDecodedPixels(
    frame,
    { preScale: { enabled: false }, targetBuffer },
    Date.now(),
    {}
  );
}

describe('postProcessDecodedPixels with a target buffer', () => {
  it('scales rows and columns by the same ratio', () => {
    // 2 x 2 decoded, 4 x 4 wanted, so both sides double. The default
    // replicate scaling lines up the first and last pixels of each side.
    const result = process(makeFrame(2, 2), {
      type: 'Uint16Array',
      rows: 4,
      columns: 4,
    });

    expect(result.rows).toBe(4);
    expect(result.columns).toBe(4);
    expect(Array.from(result.pixelData)).toEqual([
      1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 3, 3, 3, 4,
    ]);
  });

  it('scales a frame that is not square by the same ratio', () => {
    // 2 x 3 decoded, 4 x 6 wanted
    const result = process(makeFrame(2, 3), {
      type: 'Uint16Array',
      rows: 4,
      columns: 6,
    });

    expect(result.rows).toBe(4);
    expect(result.columns).toBe(6);
    expect(result.pixelData.length).toBe(24);
  });

  it('accepts a target whose columns round to the rows ratio', () => {
    // A half size decode of 4 x 5 gives 2 x 3 (the odd side rounds up)
    const result = process(makeFrame(2, 3), {
      type: 'Uint16Array',
      rows: 4,
      columns: 5,
    });

    expect(result.rows).toBe(4);
    expect(result.columns).toBe(5);
    expect(result.pixelData.length).toBe(20);
  });

  it('accepts a half size decode of a frame with odd rows and columns', () => {
    // 513 x 2049 at half size decodes to 257 x 1025, where both sides round up
    const result = process(makeFrame(257, 1025), {
      type: 'Uint16Array',
      rows: 513,
      columns: 2049,
    });

    expect(result.rows).toBe(513);
    expect(result.columns).toBe(2049);
    expect(result.pixelData.length).toBe(513 * 2049);
  });

  it('throws a clear error when only the columns differ from the target', () => {
    expect(() =>
      process(makeFrame(2, 2), {
        type: 'Uint16Array',
        rows: 2,
        columns: 4,
      })
    ).toThrow(/does not have the same rows to columns ratio/);
  });

  it('throws a clear error when the columns do not follow the rows ratio', () => {
    // rows double, columns go up by 2.56
    expect(() =>
      process(makeFrame(256, 200), {
        type: 'Uint16Array',
        rows: 512,
        columns: 512,
      })
    ).toThrow(/does not have the same rows to columns ratio/);
  });

  it('scales down by the same ratio', () => {
    // 4 x 4 decoded, 2 x 2 wanted, replicate takes the corner pixels
    const result = process(makeFrame(4, 4), {
      type: 'Uint16Array',
      rows: 2,
      columns: 2,
    });

    expect(result.rows).toBe(2);
    expect(result.columns).toBe(2);
    expect(Array.from(result.pixelData)).toEqual([1, 4, 13, 16]);
  });

  it('throws when only the rows are given', () => {
    expect(() =>
      process(makeFrame(2, 2), { type: 'Uint16Array', rows: 4 })
    ).toThrow(/needs both rows and columns/);
  });

  it('throws when only the columns are given', () => {
    expect(() =>
      process(makeFrame(2, 2), { type: 'Uint16Array', columns: 4 })
    ).toThrow(/needs both rows and columns/);
  });

  it.each([
    [0, 0],
    [NaN, NaN],
    [-4, -4],
    [4.5, 4.5],
    [4, 0],
  ])('throws when rows and columns are %p x %p', (rows, columns) => {
    expect(() =>
      process(makeFrame(2, 2), { type: 'Uint16Array', rows, columns })
    ).toThrow(/have to be positive integers/);
  });

  it('gives a buffer of the image size when rows and columns are left out', () => {
    const result = process(makeFrame(2, 3), { type: 'Uint16Array' });

    expect(result.rows).toBe(2);
    expect(result.columns).toBe(3);
    expect(result.pixelData).toBeInstanceOf(Uint16Array);
    expect(Array.from(result.pixelData)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('leaves a frame that already has the target size alone', () => {
    const result = process(makeFrame(2, 3), {
      type: 'Uint16Array',
      rows: 2,
      columns: 3,
    });

    expect(result.rows).toBe(2);
    expect(result.columns).toBe(3);
    expect(Array.from(result.pixelData)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
