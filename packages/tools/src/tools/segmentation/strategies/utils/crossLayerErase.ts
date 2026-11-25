import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import {
  collectCrossLayerEraseBindings,
  eraseLabelmapEditTransactionOverwrites,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import type { InitializedOperationData } from '../BrushStrategy';

function collectCrossLayerEraseBindingsForOperation(
  operationData: InitializedOperationData
): void {
  const { segmentationId, labelmapId, overwriteSegmentIndices } = operationData;
  const segmentation = getSegmentation(segmentationId);

  operationData.crossLayerEraseBindings = segmentation
    ? collectCrossLayerEraseBindings(
        segmentation,
        labelmapId,
        overwriteSegmentIndices
      )
    : [];
}

function eraseCrossLayerOverwrites(
  operationData: InitializedOperationData
): number[] {
  const segmentation = getSegmentation(operationData.segmentationId);

  if (!segmentation) {
    return [];
  }

  const { memo } = operationData;

  return eraseLabelmapEditTransactionOverwrites(
    segmentation,
    operationData.labelmapEditTransaction,
    {
      viewport: operationData.viewport,
      referenceImageData: operationData.segmentationImageData,
      isInObject: operationData.isInObject,
      isInObjectBoundsIJK: operationData.isInObjectBoundsIJK,
      imageId: operationData.imageId,
      // Record every cross-layer erase on the stroke's memo so undo/redo
      // restores the other layers too - these writes bypass the memo's own
      // history voxel manager (they target other layers' voxel managers).
      crossLayerEraseCallback: memo
        ? ({ voxelManager, labelValue, indices }) => {
            (memo.postSteps ||= []).push({
              undo: () => {
                for (const index of indices) {
                  voxelManager.setAtIndex(index, labelValue);
                }
                triggerSegmentationDataModified(operationData.segmentationId);
              },
              redo: () => {
                for (const index of indices) {
                  voxelManager.setAtIndex(index, 0);
                }
                triggerSegmentationDataModified(operationData.segmentationId);
              },
            });
          }
        : undefined,
    }
  );
}

export {
  collectCrossLayerEraseBindingsForOperation as collectCrossLayerEraseBindings,
  eraseCrossLayerOverwrites,
};
