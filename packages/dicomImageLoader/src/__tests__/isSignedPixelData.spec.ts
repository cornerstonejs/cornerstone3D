import isSignedPixelData from '../shared/decoders/isSignedPixelData';

describe('isSignedPixelData', () => {
  it('honors the signed flag for grayscale frames', () => {
    expect(isSignedPixelData({ isSigned: true, componentCount: 1 })).toBe(true);
    expect(isSignedPixelData({ isSigned: false, componentCount: 1 })).toBe(
      false
    );
  });

  it('ignores the signed flag for color frames', () => {
    // A real JPEG 2000 CT screenshot (SamplesPerPixel 3, BitsAllocated 8,
    // PhotometricInterpretation YBR_RCT) declares all three components signed
    // and Pixel Representation 1, both of which DICOM forbids for color
    // (PS3.3 C.7.6.3.1.2). Reading its 0-255 samples as signed made every value
    // above 127 negative, and the color conversion clamps those to 0 - 20% of
    // the frame, all of it the bright areas, rendered black.
    expect(isSignedPixelData({ isSigned: true, componentCount: 3 })).toBe(
      false
    );
    expect(isSignedPixelData({ isSigned: true, componentCount: 4 })).toBe(
      false
    );
  });

  it('does not throw on missing frame info', () => {
    expect(isSignedPixelData(undefined)).toBe(false);
    expect(isSignedPixelData({})).toBe(false);
  });
});
