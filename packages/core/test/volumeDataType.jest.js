jest.mock('../src/cache/cache', () => ({
  __esModule: true,
  default: { getImage: () => undefined },
}));
let mockCanRenderFloat = true;
jest.mock('../src/init', () => ({
  canRenderFloatTextures: () => mockCanRenderFloat,
}));
jest.mock('../src/utilities/sortImageIdsAndGetSpacing', () => ({
  __esModule: true,
  default: (imageIds) => ({
    zSpacing: 1,
    origin: [0, 0, 0],
    sortedImageIds: imageIds,
  }),
}));

let mockHeader;
let mockRescale;
jest.mock('../src/utilities/makeVolumeMetadata', () => ({
  __esModule: true,
  default: () => ({
    ImageOrientationPatient: [1, 0, 0, 0, 1, 0],
    PixelSpacing: [1, 1],
    Columns: 2,
    Rows: 2,
    PhotometricInterpretation: 'MONOCHROME2',
    ...mockHeader,
  }),
}));
jest.mock('../src/utilities/getScalingParameters', () => ({
  __esModule: true,
  default: () => ({ modality: 'CT', ...mockRescale }),
}));

import { describe, it, expect } from '@jest/globals';
import { generateVolumePropsFromImageIds } from '../src/utilities/generateVolumePropsFromImageIds';

function dataType(
  bitsAllocated,
  bitsStored,
  pixelRepresentation,
  slope,
  intercept
) {
  mockHeader = {
    BitsAllocated: bitsAllocated,
    BitsStored: bitsStored,
    PixelRepresentation: pixelRepresentation,
  };
  mockRescale = { rescaleSlope: slope, rescaleIntercept: intercept };
  return generateVolumePropsFromImageIds(['a', 'b', 'c'], 'v').dataType;
}

describe('volume data type from the scaled stored range', () => {
  it('keeps the 16-bit types of common CT and MR', () => {
    expect(dataType(16, 12, 0, 1, -1024)).toBe('Int16Array');
    expect(dataType(16, 16, 1, 1, -1024)).toBe('Int16Array');
    expect(dataType(16, 12, 0, 1, 0)).toBe('Uint16Array');
    expect(dataType(8, 8, 0, 1, 0)).toBe('Uint8Array');
  });

  it('does not wrap a slope above 1', () => {
    expect(dataType(16, 12, 0, 10, -1024)).toBe('Float32Array');
    expect(dataType(16, 12, 0, 20, 0)).toBe('Float32Array');
    expect(dataType(8, 8, 0, 2, 0)).toBe('Uint16Array');
  });

  it('does not wrap signed or offset 8-bit data', () => {
    expect(dataType(8, 8, 0, 1, -100)).toBe('Int16Array');
    expect(dataType(8, 8, 1, 1, 0)).toBe('Int16Array');
  });

  it('uses Float32 for a non-integer rescale (#2706)', () => {
    expect(dataType(16, 12, 0, 0.001, 0)).toBe('Float32Array');
    expect(dataType(8, 8, 0, 0.5, 0)).toBe('Float32Array');
  });

  it('uses the stored range when the loader cannot apply a non-integer rescale', () => {
    mockCanRenderFloat = false;
    expect(dataType(16, 16, 0, 0.5, -100)).toBe('Uint16Array');
    mockCanRenderFloat = true;
  });
});
