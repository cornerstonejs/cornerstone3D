import { isImageSliceEdit } from './imageSliceEdit';

function operationData(imageId: string | undefined, dimensions?: number[]) {
  return {
    imageId,
    segmentationVoxelManager: dimensions ? { dimensions } : undefined,
  } as never;
}

describe('isImageSliceEdit', () => {
  it('is true for a 2D edit of one labelmap image', () => {
    expect(isImageSliceEdit(operationData('labelmap-image', [4, 4, 1]))).toBe(
      true
    );
  });

  it('is false for a 3D strategy that edits the segmentation volume', () => {
    // A sphere brush in a stack viewport swaps in the volume voxel manager.
    expect(isImageSliceEdit(operationData('labelmap-image', [4, 4, 8]))).toBe(
      false
    );
  });

  it('is false for a volume edit, which has no labelmap image id', () => {
    expect(isImageSliceEdit(operationData(undefined, [4, 4, 1]))).toBe(false);
  });
});
