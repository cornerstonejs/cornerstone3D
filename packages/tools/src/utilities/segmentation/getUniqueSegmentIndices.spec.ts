import { addSegmentations } from '../../stateManagement/segmentation/addSegmentations';
import {
  removeAllSegmentations,
  removeSegmentation,
} from '../../stateManagement/segmentation/removeSegmentation';
import { defaultSegmentationStateManager } from '../../stateManagement/segmentation/SegmentationStateManager';
import { getUniqueSegmentIndices } from './getUniqueSegmentIndices';

function addLabelmapSegmentation(
  segmentationId: string,
  segmentIndices: number[]
) {
  addSegmentations([
    {
      segmentationId,
      representation: {
        type: 'Labelmap',
        data: { imageIds: ['labelmap-image-1', 'labelmap-image-2'] },
      },
      config: {
        segments: Object.fromEntries(
          segmentIndices.map((segmentIndex) => [
            segmentIndex,
            { label: `Segment ${segmentIndex}` },
          ])
        ),
      },
    },
  ]);
}

describe('getUniqueSegmentIndices', () => {
  afterEach(() => {
    removeAllSegmentations();
  });

  it('returns the segment indices of a labelmap segmentation', () => {
    const segmentationId = 'seg-indices';
    addLabelmapSegmentation(segmentationId, [2, 1]);

    expect(getUniqueSegmentIndices(segmentationId)).toEqual([1, 2]);
  });

  it('does not return the indices of a removed segmentation for a new one with the same id', () => {
    const segmentationId = 'seg-readded';
    addLabelmapSegmentation(segmentationId, [1]);
    expect(getUniqueSegmentIndices(segmentationId)).toEqual([1]);

    removeSegmentation(segmentationId);
    addLabelmapSegmentation(segmentationId, [1, 2, 3]);

    expect(getUniqueSegmentIndices(segmentationId)).toEqual([1, 2, 3]);
  });

  it('throws for a segmentation id that was removed', () => {
    const segmentationId = 'seg-removed';
    addLabelmapSegmentation(segmentationId, [1]);
    expect(getUniqueSegmentIndices(segmentationId)).toEqual([1]);

    removeSegmentation(segmentationId);

    expect(() => getUniqueSegmentIndices(segmentationId)).toThrow(
      `No segmentation found for segmentationId ${segmentationId}`
    );
  });

  it('does not return cached indices after removeAllSegmentations', () => {
    const segmentationId = 'seg-remove-all';
    addLabelmapSegmentation(segmentationId, [1]);
    expect(getUniqueSegmentIndices(segmentationId)).toEqual([1]);

    removeAllSegmentations();
    addLabelmapSegmentation(segmentationId, [2, 3]);

    expect(getUniqueSegmentIndices(segmentationId)).toEqual([2, 3]);
  });

  it('does not return cached indices after the segmentation state is reset', () => {
    const segmentationId = 'seg-reset';
    addLabelmapSegmentation(segmentationId, [1]);
    expect(getUniqueSegmentIndices(segmentationId)).toEqual([1]);

    defaultSegmentationStateManager.resetState();
    addLabelmapSegmentation(segmentationId, [4, 5]);

    expect(getUniqueSegmentIndices(segmentationId)).toEqual([4, 5]);
  });
});
