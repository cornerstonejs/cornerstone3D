import { describe, it, expect } from '@jest/globals';
import { isPseudoBinaryFractional } from '../src/adapters/Cornerstone3D/Segmentation/labelmapImagesFromBuffer';

/**
 * PR-2611 item 2d: FRACTIONAL SEGs whose pixels are only 0 or
 * MaximumFractionalValue are "pseudo-binary" and must be processable as BINARY
 * (4.x behavior). Only genuinely fractional data (intermediate values) is
 * unsupported.
 */
describe('isPseudoBinaryFractional', () => {
  it('accepts an all-zero / all-max frame (pseudo-binary)', () => {
    const pixelData = new Uint8Array([0, 255, 0, 255, 255, 0]);
    expect(isPseudoBinaryFractional(pixelData, 255)).toBe(true);
  });

  it('accepts an all-zero frame', () => {
    const pixelData = new Uint8Array([0, 0, 0, 0]);
    expect(isPseudoBinaryFractional(pixelData, 255)).toBe(true);
  });

  it('accepts a non-255 max as long as pixels are only 0 or that max', () => {
    const pixelData = new Uint8Array([0, 1, 0, 1]);
    expect(isPseudoBinaryFractional(pixelData, 1)).toBe(true);
  });

  it('rejects genuinely fractional data (intermediate probabilities)', () => {
    const pixelData = new Uint8Array([0, 128, 255, 64]);
    expect(isPseudoBinaryFractional(pixelData, 255)).toBe(false);
  });

  it('rejects when MaximumFractionalValue is missing / non-numeric', () => {
    const pixelData = new Uint8Array([0, 255, 0]);
    expect(isPseudoBinaryFractional(pixelData, undefined)).toBe(false);
    expect(isPseudoBinaryFractional(pixelData, 'abc')).toBe(false);
  });

  it('accepts a DICOM string-valued MaximumFractionalValue', () => {
    const pixelData = new Uint8Array([0, 255, 255]);
    expect(isPseudoBinaryFractional(pixelData, '255')).toBe(true);
  });
});
