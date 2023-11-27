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
    const { scalarData, segmentIndex, dimensions } = operationData;
    const elementsPerSegment = dimensions[0] * dimensions[1];
    const callback = ({ value, index }) => {
      if (value === previewSegmentationIndex) {
        scalarData[index] = segmentIndex;
        const slice = Math.floor(index / elementsPerSegment);
        operationData.modifiedSlicesToUse.add(slice);
      }
    };

    scalarData.forEach((value, index) => {
      callback({ value, index });
    });

    const arrayOfSlices: number[] = Array.from(
      operationData.modifiedSlicesToUse
    );
    operationData.modifiedSlicesToUse.clear();

    triggerSegmentationDataModified(
      operationData.segmentationId,
      arrayOfSlices
    );
  };

  const { cancelPreview } = operationData;
  operationData.cancelPreview = () => {
    cancelPreview?.();
    const { scalarData, dimensions, strategySpecificConfiguration } =
      operationData;
    const { TRACKING: tracking } = strategySpecificConfiguration;
    const frameSize = dimensions[0] * dimensions[1];
    const callback = ({ value, index, pointIJK }) => {
      if (value === previewSegmentationIndex) {
        scalarData[index] = tracking?.getter(pointIJK) ?? 0;
        const slice = Math.floor(index / frameSize);
        operationData.modifiedSlicesToUse.add(slice);
      }
    };

    const width = dimensions[0];
    scalarData.forEach((value, index) => {
      const i = index % frameSize;
      const j = Math.floor((index % frameSize) / width);
      const k = Math.floor(index / frameSize);
      callback({ value, index, pointIJK: [i, j, k] });
    });

    const arrayOfSlices: number[] = Array.from(
      operationData.modifiedSlicesToUse
    );
    operationData.modifiedSlicesToUse.clear();

    triggerSegmentationDataModified(
      operationData.segmentationId,
      arrayOfSlices
    );
  };
}
