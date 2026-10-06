import { describe, it, expect } from '@jest/globals';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkBoundingBox from '@kitware/vtk.js/Common/DataModel/BoundingBox';
import {
  sampleDistanceOf,
  MAXIMUM_SAMPLES_PER_RAY,
} from '../src/RenderingEngine/helpers/createVolumeMapper';

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
    const distance = sampleDistanceOf(imageData, undefined, 1);

    expect(Math.ceil(diagonal / distance)).toBeLessThanOrEqual(
      MAXIMUM_SAMPLES_PER_RAY
    );
  });
});
