import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import {
  beginLabelmapEditTransaction,
  resolveLabelmapLayerEditTarget,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import type { InitializedOperationData } from '../BrushStrategy';

function separateSegmentIfNeeded(
  operationData: InitializedOperationData
): void {
  const segmentation = getSegmentation(operationData.segmentationId);

  if (!segmentation || !operationData.segmentIndex) {
    return;
  }

  const transaction = beginLabelmapEditTransaction(segmentation, {
    segmentIndex: operationData.segmentIndex,
    overwriteSegmentIndices: operationData.overwriteSegmentIndices,
    segmentationVoxelManager: operationData.segmentationVoxelManager,
    segmentationImageData: operationData.segmentationImageData,
    isInObject: operationData.isInObject,
    isInObjectBoundsIJK: operationData.isInObjectBoundsIJK,
  });

  operationData.labelmapEditTransaction = transaction;
  operationData.labelmapId = transaction.labelmapId;
  operationData.labelValue = transaction.labelValue;
  operationData.crossLayerEraseBindings = transaction.crossLayerEraseBindings;

  if (!transaction.movedSegment || !transaction.activeLayer) {
    return;
  }

  const target = resolveLabelmapLayerEditTarget(transaction.activeLayer, {
    viewport: operationData.viewport,
    imageId: operationData.imageId,
    sourceLayer: transaction.sourceLayer,
  });

  if (target.imageId) {
    operationData.imageId = target.imageId;
  }

  if (target.imageData) {
    operationData.segmentationImageData = target.imageData;
  }

  if (target.voxelManager) {
    operationData.segmentationVoxelManager = target.voxelManager;
  }
}

export { separateSegmentIfNeeded };
