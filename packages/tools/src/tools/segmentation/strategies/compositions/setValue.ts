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
      configuration,
    } = operationData;

    const { segmentIndex } = operationData;
    const existingValue = segmentationVoxelManager.getAtIndex(index);

    if (segmentsLocked.includes(value)) {
      return;
    }

    if (!configuration.centerSegmentIndex && existingValue === segmentIndex) {
      return;
    }

    if (
      configuration.centerSegmentIndex &&
      configuration.centerSegmentIndex.segmentIndex !== 0 &&
      existingValue === segmentIndex
    ) {
      return;
    }

    if (!previewSegmentIndex) {
      let useSegmentIndex = segmentIndex;
      if (configuration.centerSegmentIndex) {
        useSegmentIndex = configuration.centerSegmentIndex.segmentIndex;
      }

      memo.voxelManager.setAtIndex(index, useSegmentIndex);
      return;
    }

    // this means we have previewSegmentIndex
    if (!configuration.centerSegmentIndex) {
      memo.voxelManager.setAtIndex(index, previewSegmentIndex);
      return;
    }

    // we have centerSegmentIndex with preview enabled
    const {
      hasPreviewIndex,
      hasSegmentIndex,
      segmentIndex: centerSegmentIndex,
    } = configuration.centerSegmentIndex;

    if (centerSegmentIndex === 0 && hasSegmentIndex && hasPreviewIndex) {
      if (existingValue === segmentIndex) {
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
      const changed = memo.voxelManager.setAtIndex(index, previewSegmentIndex);

      if (changed) {
        configuration.centerSegmentIndex.changedIndices.push(index);
      }
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
