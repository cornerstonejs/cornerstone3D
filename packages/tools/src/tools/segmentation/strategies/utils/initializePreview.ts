import type { InitializedOperationData } from '../BrushStrategy';
import { segmentIndex as segmentIndexController } from '../../../../stateManagement/segmentation';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';

/**
 * Sets up a preview to use an alternate set of colours.  First fills the
 * preview segment index with the final one for all pixels, then resets
 * the preview colours.
 */
export default function initializePreview(
  operationData: InitializedOperationData
) {
  const previewSegmentationIndex =
    segmentIndexController.getPreviewSegmentIndex(operationData.segmentationId);
  if (previewSegmentationIndex === undefined) {
    return;
  }
  const { acceptPreview } = operationData;
  operationData.acceptPreview = () => {
    acceptPreview?.();
    const {
      segmentIndex,
      strategySpecificConfiguration,
      segmentationVoxelValue,
    } = operationData;
    const tracking = strategySpecificConfiguration?.TRACKING;
    if (!tracking || tracking.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index }) => {
      const oldValue = segmentationVoxelValue.getIndex(index);
      if (oldValue === previewSegmentationIndex) {
        segmentationVoxelValue.setIndex(index, segmentIndex);
      }
    };
    tracking.forEach(callback);

    triggerSegmentationDataModified(
      operationData.segmentationId,
      tracking.getArrayOfSlices()
    );
    tracking.clear();
  };

  const { cancelPreview } = operationData;
  operationData.cancelPreview = () => {
    cancelPreview?.();
    const { strategySpecificConfiguration, segmentationVoxelValue } =
      operationData;
    const tracking = strategySpecificConfiguration?.TRACKING;
    if (!tracking || tracking.modifiedSlices.size === 0) {
      return;
    }

    const callback = ({ index, value }) => {
      segmentationVoxelValue.setIndex(index, value);
    };
    tracking.forEach(callback);

    triggerSegmentationDataModified(
      operationData.segmentationId,
      tracking.getArrayOfSlices()
    );
    tracking.clear();
  };
}
