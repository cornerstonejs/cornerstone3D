import type { InitializedOperationData } from '../BrushStrategy';
import { segmentIndex as segmentIndexController } from '../../../../stateManagement/segmentation';

/**
 * Creates a set value function which will apply the specified segmentIndex
 * to the given location.
 * Uses a strategy pattern getPreviewSegmentIndex call to choose an alternate
 * segment index to use for preview colouring.
 */
export default function initializeSetValue(
  operationData: InitializedOperationData
) {
  const previewSegmentationIndex =
    segmentIndexController.getPreviewSegmentIndex(operationData.segmentationId);
  operationData.setValue = ({ value, index, pointIJK }) => {
    if (
      operationData.segmentsLocked.includes(value) ||
      value === operationData.segmentIndex
    ) {
      return;
    }
    const useIndex = previewSegmentationIndex ?? operationData.segmentIndex;

    operationData.scalarData[index] = useIndex;
    operationData.segmentIndices.add(useIndex);
    // The k dimension is always the slice selector for IJK
    operationData.modifiedSlicesToUse.add(pointIJK[2]);
    operationData.strategySpecificConfiguration.TRACKING?.updateValue?.(
      pointIJK,
      value,
      useIndex
    );
  };
}
