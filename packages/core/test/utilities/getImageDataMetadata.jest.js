jest.mock('../../src/utilities/buildMetadata', () => ({
  buildMetadata: jest.fn(),
}));

import { buildMetadata } from '../../src/utilities/buildMetadata';
import { getImageDataMetadata } from '../../src/utilities/getImageDataMetadata';

function createImage() {
  return {
    columns: 512,
    rows: 512,
    width: 512,
    height: 512,
    columnPixelSpacing: 0.78,
    rowPixelSpacing: 0.78,
    sizeInBytes: 512 * 512 * 2,
    numberOfComponents: 1,
  };
}

function mockMetadata(rowCosines, columnCosines) {
  buildMetadata.mockReturnValue({
    imagePlaneModule: {
      rowCosines,
      columnCosines,
      imageOrientationPatient: [...rowCosines, ...columnCosines],
      imagePositionPatient: [-1600, -1600, 0],
      rowPixelSpacing: 0.78,
      columnPixelSpacing: 0.78,
    },
    imagePixelModule: {
      bitsAllocated: 16,
      photometricInterpretation: 'MONOCHROME2',
    },
    modality: 'MR',
    scalingFactor: 1,
    calibration: {},
  });
}

describe('getImageDataMetadata orientation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('orthonormalizes invalid DICOM direction cosines for rendering', () => {
    const rowCosines = [0.79, 0.61, 0];
    const columnCosines = [0.61, 0.79, 0];
    mockMetadata(rowCosines, columnCosines);

    const { direction, imagePlaneModule, scanAxisNormal } =
      getImageDataMetadata(createImage());
    const row = direction.slice(0, 3);
    const column = direction.slice(3, 6);
    const dot = row.reduce(
      (sum, component, index) => sum + component * column[index],
      0
    );

    expect(Math.hypot(...row)).toBeCloseTo(1);
    expect(Math.hypot(...column)).toBeCloseTo(1);
    expect(dot).toBeCloseTo(0);
    expect(column[0]).toBeCloseTo(-0.611, 3);
    expect(column[1]).toBeCloseTo(0.792, 3);
    expect(column[2]).toBe(0);
    expect(scanAxisNormal[0]).toBeCloseTo(0);
    expect(scanAxisNormal[1]).toBeCloseTo(0);
    expect(scanAxisNormal[2]).toBeCloseTo(1);

    expect(imagePlaneModule.rowCosines).toBe(rowCosines);
    expect(imagePlaneModule.columnCosines).toBe(columnCosines);
  });

  it('preserves an already orthonormal identity orientation', () => {
    mockMetadata([1, 0, 0], [0, 1, 0]);

    const { direction } = getImageDataMetadata(createImage());

    expect(direction).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('falls back to identity for parallel direction vectors', () => {
    mockMetadata([1, 0, 0], [1, 0, 0]);

    const { direction } = getImageDataMetadata(createImage());

    expect(direction).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});
