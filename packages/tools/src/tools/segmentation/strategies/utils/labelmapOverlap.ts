import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import { beginLabelmapEditTransaction } from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
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
  });

  operationData.labelmapEditTransaction = transaction;
  operationData.labelValue = transaction.labelValue;
  operationData.labelmapId = transaction.labelmapId;
  operationData.crossLayerEraseBindings = transaction.crossLayerEraseBindings;
}

export { eraseCrossLayerOverwrites, prepareOverlapOperationData };
