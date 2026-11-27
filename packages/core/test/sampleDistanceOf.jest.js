import { describe, it, expect } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkBoundingBox from '@kitware/vtk.js/Common/DataModel/BoundingBox';
import {
  sampleDistanceOf,
  setIdleSampleDistanceMultiplier,
  idleSampleDistanceMultiplierOf,
  MAXIMUM_SAMPLES_PER_RAY,
} from '../src/RenderingEngine/helpers/createVolumeMapper';
import { setLossyDownsampling } from '../src/init';

function imageDataOf(dimensions, spacing) {
  const imageData = vtkImageData.newInstance();

  imageData.setDimensions(dimensions);
  imageData.setSpacing(spacing);

  return imageData;
}

describe('sampleDistanceOf', () => {
  it('takes half the mean voxel side of the grid that the texture holds', () => {
    const imageData = imageDataOf([64, 64, 64], [1, 1, 1]);
    const reduced = { getGrid: () => ({ spacing: [2, 2, 2] }) };

    expect(sampleDistanceOf(imageData, undefined, 1)).toBeCloseTo(0.5);
    expect(sampleDistanceOf(imageData, reduced, 1)).toBeCloseTo(1);
  });

  it('keeps the samples of the longest ray within the maximum', () => {
    const imageData = imageDataOf([512, 512, 2464], [0.7, 0.7, 0.5]);
    const diagonal = vtkBoundingBox.getDiagonalLength(imageData.getBounds());

    setLossyDownsampling({ final: true });

    try {
      const distance = sampleDistanceOf(imageData, undefined, 1);

      expect(Math.ceil(diagonal / distance)).toBeLessThanOrEqual(
        MAXIMUM_SAMPLES_PER_RAY
      );
    } finally {
      setLossyDownsampling({ final: false });
    }
  });

  // The API must do this: a multiplier of 0 or NaN that a viewport sets must
  // not reach the sample distance of the next bind.
  it('gives a finite positive distance on a bind after a multiplier of 0 or NaN', () => {
    const imageData = imageDataOf([64, 64, 64], [1, 1, 1]);

    for (const multiplier of [0, NaN]) {
      const mapper = {};
      setIdleSampleDistanceMultiplier(mapper, multiplier);
      const idle = idleSampleDistanceMultiplierOf(mapper);

      expect(sampleDistanceOf(imageData, undefined, idle)).toBeGreaterThan(0);
    }
  });
});
