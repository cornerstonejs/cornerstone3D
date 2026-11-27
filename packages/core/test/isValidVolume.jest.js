import * as metaData from '../src/metaData';
import { MetadataModules } from '../src/enums';
import { isValidVolume } from '../src/utilities/isValidVolume';

const AXIAL = [1, 0, 0, 0, 1, 0];
const SAGITTAL = [0, 1, 0, 0, 0, -1];

describe('isValidVolume', () => {
  let planes = {};

  const provider = (type, imageId) => {
    if (!planes[imageId]) {
      return;
    }
    if (type === MetadataModules.GENERAL_SERIES) {
      return { modality: 'MR', seriesInstanceUID: '1.2.3' };
    }
    if (type === MetadataModules.IMAGE_PLANE) {
      return planes[imageId];
    }
  };

  // One image per position, `axis` giving the direction the stack moves in.
  const stack = (positions, orientation = AXIAL, axis = [0, 0, 1]) => {
    planes = {};
    return positions.map((distance, index) => {
      const imageId = `test:image-${index}`;
      planes[imageId] = {
        imageOrientationPatient: orientation,
        imagePositionPatient: axis.map((component) => component * distance),
        pixelSpacing: [1, 1],
        frameOfReferenceUID: '1.2.3.4',
        rows: 256,
        columns: 256,
      };
      return imageId;
    });
  };

  // Positions from cumulative gaps between consecutive images.
  const fromGaps = (gaps) =>
    gaps.reduce(
      (positions, gap) => [...positions, positions.at(-1) + gap],
      [0]
    );

  beforeAll(() => metaData.addProvider(provider, 10000));
  afterAll(() => metaData.removeProvider(provider));

  it('accepts an evenly spaced stack', () => {
    expect(isValidVolume(stack(fromGaps(new Array(23).fill(3))))).toBe(true);
  });

  it('accepts an evenly spaced stack given out of order', () => {
    expect(isValidVolume(stack([6, 0, 9, 3]))).toBe(true);
  });

  it('accepts positions that drift by less than half a slice', () => {
    expect(isValidVolume(stack([0, 3.4, 5.8, 9]))).toBe(true);
  });

  it('measures the spacing along the scan axis of the orientation', () => {
    expect(isValidVolume(stack([0, 2, 4, 6], SAGITTAL, [1, 0, 0]))).toBe(true);
    expect(isValidVolume(stack([0, 1, 11, 12], SAGITTAL, [1, 0, 0]))).toBe(
      false
    );
  });

  it('rejects a stack whose middle image is off the averaged grid', () => {
    expect(isValidVolume(stack([0, 5, 40]))).toBe(false);
  });

  it('rejects a stack with uneven gaps between its images', () => {
    const gaps = [
      10, 10, 15, 5, 30, 5, 10, 5, 15, 10, 135, 5, 25, 10, 15, 25, 10, 5, 25,
      10, 5, 10, 20, 10,
    ];
    expect(isValidVolume(stack(fromGaps(gaps)))).toBe(false);
  });

  it('accepts images that share one position, as before', () => {
    expect(isValidVolume(stack([7, 7, 7, 7]))).toBe(true);
  });

  it('accepts two images, which always fit a grid', () => {
    expect(isValidVolume(stack([0, 40]))).toBe(true);
  });
});
