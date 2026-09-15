import getPixelData from '../shared/decoders/getPixelData';

/** A decoded WASM buffer, as the codecs hand it over. */
function decodedBuffer(bytes: number[], byteOffset = 0) {
  const backing = new Uint8Array(byteOffset + bytes.length);

  backing.set(bytes, byteOffset);

  return new Uint8Array(backing.buffer, byteOffset, bytes.length);
}

describe('getPixelData', () => {
  it('reads 8 bit grayscale as signed when the frame info says so', () => {
    const pixelData = getPixelData(
      { bitsPerSample: 8, isSigned: true, componentCount: 1 },
      decodedBuffer([0, 127, 128, 255])
    );

    expect(pixelData).toEqual(new Int8Array([0, 127, -128, -1]));
  });

  it('reads 8 bit grayscale as unsigned when the frame info says so', () => {
    const pixelData = getPixelData(
      { bitsPerSample: 8, isSigned: false, componentCount: 1 },
      decodedBuffer([0, 127, 128, 255])
    );

    expect(pixelData).toEqual(new Uint8Array([0, 127, 128, 255]));
  });

  it('reads color as unsigned however the codec declares it', () => {
    // The bug this guards: an encoder marking all three components of an
    // ordinary 0-255 RGB frame signed made every sample above 127 negative,
    // and the color conversion clamps those to 0.
    const pixelData = getPixelData(
      { bitsPerSample: 8, isSigned: true, componentCount: 3 },
      decodedBuffer([0, 127, 128, 255, 200, 10])
    );

    expect(pixelData).toEqual(new Uint8Array([0, 127, 128, 255, 200, 10]));
  });

  it('uses 16 bit views above 8 bits per sample', () => {
    expect(
      getPixelData(
        { bitsPerSample: 16, isSigned: true, componentCount: 1 },
        decodedBuffer([0, 0, 0xff, 0xff])
      )
    ).toEqual(new Int16Array([0, -1]));

    expect(
      getPixelData(
        { bitsPerSample: 16, isSigned: false, componentCount: 1 },
        decodedBuffer([0, 0, 0xff, 0xff])
      )
    ).toEqual(new Uint16Array([0, 65535]));
  });

  it('prefers the metadata signedness over the frame info when given', () => {
    // JPEG-LS takes signedness from Pixel Representation rather than from the
    // codestream, so an explicit override has to win in both directions.
    expect(
      getPixelData(
        { bitsPerSample: 8, isSigned: false, componentCount: 1 },
        decodedBuffer([255]),
        true
      )
    ).toEqual(new Int8Array([-1]));

    expect(
      getPixelData(
        { bitsPerSample: 8, isSigned: true, componentCount: 1 },
        decodedBuffer([255]),
        false
      )
    ).toEqual(new Uint8Array([255]));
  });

  it('defaults to unsigned when nothing declares signedness', () => {
    expect(
      getPixelData(
        { bitsPerSample: 8, componentCount: 1 },
        decodedBuffer([255])
      )
    ).toEqual(new Uint8Array([255]));
  });

  it('views the decoded bytes in place, at their offset', () => {
    // The codecs hand over a view into a much larger WASM heap, so the offset
    // and length have to be carried over rather than assumed to be 0.
    const buffer = decodedBuffer([1, 2, 3, 4], 8);
    const pixelData = getPixelData(
      { bitsPerSample: 8, isSigned: false, componentCount: 1 },
      buffer
    );

    expect(pixelData.buffer).toBe(buffer.buffer);
    expect(pixelData.byteOffset).toBe(8);
    expect(pixelData.length).toBe(4);
  });
});
