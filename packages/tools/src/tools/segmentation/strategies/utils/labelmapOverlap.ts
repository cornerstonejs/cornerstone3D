import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import {
  beginLabelmapEditTransaction,
  resolveLabelmapLayerEditTarget,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import type { InitializedOperationData } from '../BrushStrategy';
import { eraseCrossLayerOverwrites } from './crossLayerErase';
import { resolveOverwriteSegmentIndices } from './overwritePolicy';

function prepareOverlapOperationData(
  operationData: InitializedOperationData
): void {
  const segmentation = getSegmentation(operationData.segmentationId);
  if (!segmentation) {
    return;
  }

  operationData.overwriteSegmentIndices =
    resolveOverwriteSegmentIndices(operationData);

  const transaction = beginLabelmapEditTransaction(segmentation, {
    segmentIndex: operationData.segmentIndex,
    overwriteSegmentIndices: operationData.overwriteSegmentIndices,
    segmentationVoxelManager: operationData.segmentationVoxelManager,
    segmentationImageData: operationData.segmentationImageData,
    isInObject: operationData.isInObject,
    isInObjectBoundsIJK: operationData.isInObjectBoundsIJK,
  });

  operationData.labelmapEditTransaction = transaction;
  operationData.labelValue = transaction.labelValue;
  operationData.labelmapId = transaction.labelmapId;
  operationData.crossLayerEraseBindings = transaction.crossLayerEraseBindings;

  if (transaction.movedSegment && transaction.activeLayer) {
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
}

export { eraseCrossLayerOverwrites, prepareOverlapOperationData };
