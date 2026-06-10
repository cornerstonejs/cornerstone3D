import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
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

  return eraseLabelmapEditTransactionOverwrites(
    segmentation,
    operationData.labelmapEditTransaction,
    {
      viewport: operationData.viewport,
      referenceImageData: operationData.segmentationImageData,
      isInObject: operationData.isInObject,
      isInObjectBoundsIJK: operationData.isInObjectBoundsIJK,
      imageId: operationData.imageId,
    }
  );
}

export {
  collectCrossLayerEraseBindingsForOperation as collectCrossLayerEraseBindings,
  eraseCrossLayerOverwrites,
};
