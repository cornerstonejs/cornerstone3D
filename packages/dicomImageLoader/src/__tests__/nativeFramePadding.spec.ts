import decodeLittleEndian from '../shared/decoders/decodeLittleEndian';
import decodeBigEndian from '../shared/decoders/decodeBigEndian';

/** A 3x3 frame: with 3 samples at 8 bits it is 27 bytes, an odd length. */
function frame(overrides = {}) {
  return {
    rows: 3,
    columns: 3,
    samplesPerPixel: 3,
    bitsAllocated: 8,
    pixelRepresentation: 0,
    ...overrides,
  } as never;
}

/** The pixel bytes 1..count, followed by the pad byte when padded. */
function bytes(count: number, padded: boolean) {
  const out = new Uint8Array(count + (padded ? 1 : 0));
  for (let i = 0; i < count; i++) {
    out[i] = i + 1;
  }
  return out;
}

describe.each([
  ['decodeLittleEndian', decodeLittleEndian],
  ['decodeBigEndian', decodeBigEndian],
])('%s on native 8 bit frames', (_name, decode) => {
  it('drops the pad byte that makes an odd frame even', async () => {
    // Pixel Data is padded to an even length (PS3.5 7.1.1), and WADO-RS
    // servers can return the pad byte with the frame.
    const { pixelData } = await decode(frame(), bytes(27, true));

    expect(pixelData.length).toBe(27);
    expect(Array.from(pixelData)).toEqual(Array.from(bytes(27, false)));
  });

  it('keeps a frame of the native length as it is', async () => {
    const { pixelData } = await decode(frame(), bytes(27, false));

    expect(pixelData.length).toBe(27);
  });

  it('keeps a shorter YBR_FULL_422 frame, which has two samples per pixel', async () => {
    const { pixelData } = await decode(
      frame({ photometricInterpretation: 'YBR_FULL_422' }),
      bytes(18, false)
    );

    expect(pixelData.length).toBe(18);
  });
});
