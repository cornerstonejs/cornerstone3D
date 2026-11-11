import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import {
  beginLabelmapEditTransaction,
  getLockedVoxelsOnOtherLayers,
  resolveLabelmapLayerEditTarget,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import type { InitializedOperationData } from '../BrushStrategy';
import { eraseCrossLayerOverwrites } from './crossLayerErase';
import { isImageSliceEdit } from './imageSliceEdit';
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
    segmentsLocked: operationData.segmentsLocked,
    segmentationVoxelManager: operationData.segmentationVoxelManager,
    segmentationImageData: operationData.segmentationImageData,
    isInObject: operationData.isInObject,
    isInObjectBoundsIJK: operationData.isInObjectBoundsIJK,
  });

  operationData.labelmapEditTransaction = transaction;
  operationData.labelValue = transaction.labelValue;
  operationData.labelmapId = transaction.labelmapId;
  operationData.crossLayerEraseBindings = transaction.crossLayerEraseBindings;
  const imageSliceEdit = isImageSliceEdit(operationData);
  transaction.imageSliceEdit = imageSliceEdit;

  if (transaction.movedSegment && transaction.activeLayer) {
    const target = resolveLabelmapLayerEditTarget(transaction.activeLayer, {
      viewport: operationData.viewport,
      imageId: operationData.imageId,
      sourceLayer: transaction.sourceLayer,
      imageSliceEdit,
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

  // After a move, the locked segments are on other layers than the edited
  // layer. setValue reads those layers too.
  transaction.lockedVoxelsOnOtherLayers = getLockedVoxelsOnOtherLayers(
    segmentation,
    transaction.labelmapId,
    operationData.segmentsLocked,
    {
      viewport: operationData.viewport,
      imageId: operationData.imageId,
      sourceLayer: transaction.activeLayer,
      imageSliceEdit,
    }
  );
}

export { eraseCrossLayerOverwrites, prepareOverlapOperationData };
