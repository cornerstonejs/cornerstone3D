import { describe, it, expect, afterEach } from '@jest/globals';
import { addProvider, removeProvider } from '../../src/metaData';
import imageToWorldCoords from '../../src/utilities/imageToWorldCoords';
import worldToImageCoords from '../../src/utilities/worldToImageCoords';

describe('imageToWorldCoords and worldToImageCoords', () => {
  const providers = [];

  const registerImagePlane = (imageId, imagePlaneModule) => {
    const provider = (type, id) => {
      if (type === 'imagePlaneModule' && id === imageId) {
        return imagePlaneModule;
      }
    };
    providers.push(provider);
    addProvider(provider, 10000);
  };

  afterEach(() => {
    while (providers.length > 0) {
      removeProvider(providers.pop());
    }
  });

  it('applies columnPixelSpacing along rowCosines and rowPixelSpacing along columnCosines (DICOM PS3.3 C.7.6.2.1-1)', () => {
    const imageId = 'test://anisotropic-axis-aligned';
    registerImagePlane(imageId, {
      imagePositionPatient: [0, 0, 0],
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      rowPixelSpacing: 2.0,
      columnPixelSpacing: 0.5,
    });

    // Top-left pixel center [0.5, 0.5] maps to imagePositionPatient
    expect(imageToWorldCoords(imageId, [0.5, 0.5])).toEqual([0, 0, 0]);
    expect(worldToImageCoords(imageId, [0, 0, 0])).toEqual([0.5, 0.5]);

    // Top-left pixel corner [0, 0] is shifted by -columnPixelSpacing/2 along rowCosines
    // and -rowPixelSpacing/2 along columnCosines
    expect(imageToWorldCoords(imageId, [0, 0])).toEqual([-0.25, -1.0, 0]);
    expect(worldToImageCoords(imageId, [-0.25, -1.0, 0])).toEqual([0, 0]);

    // Center of pixel (col=10, row=20) is [10.5, 20.5]:
    // P = S + 10 * columnPixelSpacing * rowCosines + 20 * rowPixelSpacing * columnCosines
    //   = [0, 0, 0] + 10 * 0.5 * [1, 0, 0] + 20 * 2.0 * [0, 1, 0] = [5, 40, 0]
    expect(imageToWorldCoords(imageId, [10.5, 20.5])).toEqual([5, 40, 0]);
    expect(worldToImageCoords(imageId, [5, 40, 0])).toEqual([10.5, 20.5]);
  });

  it('uses the right pixel spacing axes for non-axis-aligned orientations', () => {
    const imageId = 'test://anisotropic-sagittal';
    registerImagePlane(imageId, {
      imagePositionPatient: [10, 20, 30],
      rowCosines: [0, 1, 0],
      columnCosines: [0, 0, -1],
      rowPixelSpacing: 3.0,
      columnPixelSpacing: 0.75,
    });

    // Center of pixel (col=4, row=6) is [4.5, 6.5]:
    // P = [10, 20, 30] + 4 * 0.75 * [0, 1, 0] + 6 * 3.0 * [0, 0, -1]
    //   = [10, 23, 12]
    const world = imageToWorldCoords(imageId, [4.5, 6.5]);
    expect(world[0]).toBeCloseTo(10, 6);
    expect(world[1]).toBeCloseTo(23, 6);
    expect(world[2]).toBeCloseTo(12, 6);

    const image = worldToImageCoords(imageId, [10, 23, 12]);
    expect(image[0]).toBeCloseTo(4.5, 6);
    expect(image[1]).toBeCloseTo(6.5, 6);
  });

  it('defaults missing or zero pixel spacing to 1', () => {
    const imageId = 'test://default-spacing';
    registerImagePlane(imageId, {
      imagePositionPatient: [1, 2, 3],
      rowCosines: [1, 0, 0],
      columnCosines: [0, 1, 0],
      rowPixelSpacing: 0,
      columnPixelSpacing: undefined,
    });

    expect(imageToWorldCoords(imageId, [2.5, 3.5])).toEqual([3, 5, 3]);
    expect(worldToImageCoords(imageId, [3, 5, 3])).toEqual([2.5, 3.5]);
  });
});
