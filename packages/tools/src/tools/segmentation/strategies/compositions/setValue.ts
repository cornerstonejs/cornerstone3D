import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import { handleUseSegmentCenterIndex } from '../utils/handleUseSegmentCenterIndex';
import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import { getSegmentIndexForLabelValue } from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';

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
      segmentIndex,
      labelValue,
      labelmapId,
      segmentationId,
    } = operationData;

    const existingValue = segmentationVoxelManager.getAtIndex(index);
    const segmentation = getSegmentation(segmentationId);
    const existingSegmentIndex =
      segmentation && labelmapId
        ? getSegmentIndexForLabelValue(segmentation, labelmapId, existingValue)
        : existingValue;
    const writeValue = previewSegmentIndex ?? labelValue ?? segmentIndex;

    if (segmentsLocked.includes(existingSegmentIndex)) {
      return;
    }

    if (
      !centerSegmentIndexInfo &&
      existingValue === (labelValue ?? segmentIndex)
    ) {
      return;
    }

    if (
      centerSegmentIndexInfo?.segmentIndex !== 0 &&
      existingValue === (labelValue ?? segmentIndex)
    ) {
      return;
    }

    // this means we have previewSegmentIndex
    if (centerSegmentIndexInfo?.segmentIndex === null) {
      memo.voxelManager.setAtIndex(index, writeValue);
      return;
    }

    if (!previewSegmentIndex) {
      let useSegmentIndex = labelValue ?? segmentIndex;
      if (centerSegmentIndexInfo) {
        useSegmentIndex = centerSegmentIndexInfo.segmentIndex;
      }

      memo.voxelManager.setAtIndex(index, useSegmentIndex);
      return;
    }

    // we have centerSegmentIndexInfo with preview enabled
    handleUseSegmentCenterIndex({
      operationData,
      existingValue,
      index,
    });
  },
};
