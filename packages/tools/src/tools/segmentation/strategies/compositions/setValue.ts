import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

/**
 * Creates a set value function which will apply the specified segmentIndex
 * to the given location.
 * If segmentIndex is null, it will clear the given segment index instead
 * This is all done through the voxelManager so that values can be recorded
 * as changed, and the original values remembered.
 */
export default {
  [StrategyCallbacks.INTERNAL_setValue]: (
    operationData: InitializedOperationData,
    { value, index }
  ) => {
    const {
      segmentsLocked,
      previewSegmentIndex,
      memo,
      segmentationVoxelManager,
      centerSegmentIndexInfo,
      previewOnHover,
    } = operationData;

    const { segmentIndex } = operationData;
    const existingValue = segmentationVoxelManager.getAtIndex(index);

    if (segmentsLocked.includes(value)) {
      return;
    }

    if (!centerSegmentIndexInfo && existingValue === segmentIndex) {
      return;
    }

    if (
      centerSegmentIndexInfo &&
      centerSegmentIndexInfo.segmentIndex !== 0 &&
      existingValue === segmentIndex
    ) {
      return;
    }

    // this means we have previewSegmentIndex
    if (centerSegmentIndexInfo.segmentIndex === null) {
      memo.voxelManager.setAtIndex(index, previewSegmentIndex ?? segmentIndex);
      return;
    }

    if (!previewSegmentIndex) {
      let useSegmentIndex = segmentIndex;
      if (centerSegmentIndexInfo) {
        useSegmentIndex = centerSegmentIndexInfo.segmentIndex;
      }

      memo.voxelManager.setAtIndex(index, useSegmentIndex);
      return;
    }

    // we have centerSegmentIndexInfo with preview enabled
    const {
      hasPreviewIndex,
      hasSegmentIndex,
      segmentIndex: centerSegmentIndex,
    } = centerSegmentIndexInfo;

    if (centerSegmentIndex === 0 && hasSegmentIndex && hasPreviewIndex) {
      if (existingValue === segmentIndex) {
        return;
      }

      // Don't let previewOnHover override the value since basically there might be a
      // moment where we have the preview from the hover and that might get confused by
      // the actual segmentation
      if (previewOnHover) {
        return;
      }

      if (existingValue === previewSegmentIndex) {
        memo.voxelManager.setAtIndex(index, 0);
        return;
      }

      return;
    }

    if (centerSegmentIndex === 0 && hasSegmentIndex && !hasPreviewIndex) {
      if (existingValue === 0 || existingValue !== segmentIndex) {
        return;
      }

      memo.voxelManager.setAtIndex(index, previewSegmentIndex);
      centerSegmentIndexInfo.changedIndices.push(index);
      return;
    }

    if (centerSegmentIndex === 0 && !hasSegmentIndex && hasPreviewIndex) {
      if (existingValue === segmentIndex) {
        return;
      }

      if (existingValue === previewSegmentIndex) {
        memo.voxelManager.setAtIndex(index, 0);
        return;
      }

      return;
    }

    if (centerSegmentIndex === 0 && !hasSegmentIndex && !hasPreviewIndex) {
      if (existingValue === segmentIndex) {
        return;
      }

      if (existingValue === previewSegmentIndex) {
        memo.voxelManager.setAtIndex(index, previewSegmentIndex);
        return;
      }

      return;
    }

    if (
      centerSegmentIndex === previewSegmentIndex &&
      hasSegmentIndex &&
      hasPreviewIndex
    ) {
      if (existingValue === segmentIndex) {
        return;
      }

      memo.voxelManager.setAtIndex(index, previewSegmentIndex);

      return;
    }

    if (
      centerSegmentIndex === previewSegmentIndex &&
      !hasSegmentIndex &&
      hasPreviewIndex
    ) {
      if (existingValue === segmentIndex) {
        return;
      }

      memo.voxelManager.setAtIndex(index, previewSegmentIndex);

      return;
    }

    if (
      centerSegmentIndex === segmentIndex &&
      hasSegmentIndex &&
      hasPreviewIndex
    ) {
      if (existingValue === segmentIndex) {
        return;
      }

      memo.voxelManager.setAtIndex(index, previewSegmentIndex);

      return;
    }
    if (
      centerSegmentIndex === segmentIndex &&
      hasSegmentIndex &&
      !hasPreviewIndex
    ) {
      if (existingValue === segmentIndex) {
        return;
      }

      memo.voxelManager.setAtIndex(index, previewSegmentIndex);

      return;
    }
  },
};
