jest.mock(
  '../../../../stateManagement/segmentation/events/triggerSegmentationDataModified',
  () => ({ triggerSegmentationDataModified: jest.fn() })
);

import { utilities } from '@cornerstonejs/core';
import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/events/triggerSegmentationDataModified';
import preview from './preview';

const acceptPreview = preview[StrategyCallbacks.AcceptPreview] as (
  operationData: InitializedOperationData
) => void;

const PREVIEW_SEGMENT_INDEX = 4;

/**
 * Operation data for a 3 voxel labelmap whose middle voxel shows the preview,
 * and a memo voxel manager that records what the accept writes.
 */
function createOperationData(overrides = {}) {
  const dimensions = [3, 1, 1] as [number, number, number];
  const segmentationVoxelManager =
    utilities.VoxelManager.createScalarVolumeVoxelManager({
      dimensions,
      scalarData: Uint8Array.from([0, PREVIEW_SEGMENT_INDEX, 1]),
    });
  const memoVoxelManager = { setAtIndex: jest.fn() };

  return {
    segmentationId: 'segmentation',
    segmentIndex: 2,
    previewSegmentIndex: PREVIEW_SEGMENT_INDEX,
    segmentationVoxelManager,
    memo: { voxelManager: memoVoxelManager },
    centerSegmentIndexInfo: { changedIndices: [] },
    ...overrides,
  } as unknown as InitializedOperationData & {
    memo: { voxelManager: { setAtIndex: jest.Mock } };
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('preview composition: AcceptPreview', () => {
  it('writes the segment index over the preview voxels', () => {
    const operationData = createOperationData();

    acceptPreview(operationData);

    expect(operationData.memo.voxelManager.setAtIndex).toHaveBeenCalledTimes(1);
    expect(operationData.memo.voxelManager.setAtIndex).toHaveBeenCalledWith(
      1,
      2
    );
    expect(triggerSegmentationDataModified).toHaveBeenCalledWith(
      'segmentation',
      expect.any(Array),
      2
    );
  });

  // The strategy initializes no data when the segmentation has no labelmap to
  // edit, for example after it was removed while the brush was active. The
  // accept used to read segmentationVoxelManager.forEach and threw. See #2549.
  it.each([
    ['no operation data', null],
    ['operation data without a labelmap voxel manager', { segmentIndex: 1 }],
  ])('does nothing and does not throw for %s', (_, operationData) => {
    expect(() =>
      acceptPreview(operationData as unknown as InitializedOperationData)
    ).not.toThrow();
    expect(triggerSegmentationDataModified).not.toHaveBeenCalled();
  });

  it('accepts the preview when there is no center segment index info', () => {
    const operationData = createOperationData({
      centerSegmentIndexInfo: undefined,
    });

    expect(() => acceptPreview(operationData)).not.toThrow();
    expect(operationData.memo.voxelManager.setAtIndex).toHaveBeenCalledWith(
      1,
      2
    );
  });
});
