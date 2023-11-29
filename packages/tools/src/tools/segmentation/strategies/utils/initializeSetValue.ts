import type { InitializedOperationData } from '../BrushStrategy';
import {
  segmentIndex,
  segmentIndex as segmentIndexController,
} from '../../../../stateManagement/segmentation';

/**
 * Creates a set value function which will apply the specified segmentIndex
 * to the given location.
 * Uses a strategy pattern getPreviewSegmentIndex call to choose an alternate
 * segment index to use for preview colouring.
 */
export default function initializeSetValue(
  operationData: InitializedOperationData
) {
  const { previewVoxelValue, previewSegmentIndex } = operationData;

  operationData.setValue = ({ value, index }) => {
    if (operationData.segmentsLocked.includes(value)) {
      return;
    }
    const useSegmentIndex = previewSegmentIndex ?? operationData.segmentIndex;

    previewVoxelValue.setIndex(index, useSegmentIndex);
  };
}
