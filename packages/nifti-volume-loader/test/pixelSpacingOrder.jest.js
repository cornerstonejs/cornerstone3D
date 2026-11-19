import makeVolumeMetadata from '../src/helpers/makeVolumeMetadata';
import makeImagePlaneMetadata from '../src/helpers/makeImagePlaneMetadata';

jest.mock('@cornerstonejs/core', () => ({
  utilities: {
    windowLevel: {
      toWindowLevel: () => ({ windowWidth: 400, windowCenter: 40 }),
    },
  },
}));

const orientation = [1, 0, 0, 0, 1, 0, 0, 0, 1];

describe('NIfTI PixelSpacing order', () => {
  it('stores volume PixelSpacing as [row, column]', () => {
    const header = {
      numBitsPerVoxel: 16,
      littleEndian: true,
      pixDims: [1, 0.3, 0.5, 2],
      dims: [3, 10, 20, 4],
    };

    const { volumeMetadata } = makeVolumeMetadata(header, orientation, 1);

    expect(volumeMetadata.PixelSpacing).toEqual([0.5, 0.3]);
  });

  it('stores image plane pixelSpacing as [row, column]', () => {
    const metadata = makeImagePlaneMetadata({
      dimensions: [10, 20, 4],
      direction: orientation,
      spacing: [0.3, 0.5, 2],
      origin: [0, 0, 0],
      imageIdIndex: 1,
    });

    expect(metadata.pixelSpacing).toEqual([0.5, 0.3]);
    expect(metadata.rowPixelSpacing).toBe(0.5);
    expect(metadata.columnPixelSpacing).toBe(0.3);
    expect(metadata.rows).toBe(20);
    expect(metadata.columns).toBe(10);
    expect(metadata.imagePositionPatient).toEqual([0, 0, 2]);
  });
});
