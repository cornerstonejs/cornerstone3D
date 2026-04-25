import { getSegmentation } from '../../../../stateManagement/segmentation/getSegmentation';
import {
  getLabelValueForSegment,
  getLabelmapForSegment,
} from '../../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import type { InitializedOperationData } from '../BrushStrategy';
import {
  collectCrossLayerEraseBindings,
  eraseCrossLayerOverwrites,
} from './crossLayerErase';
import { resolveOverwriteSegmentIndices } from './overwritePolicy';
import { separateSegmentIfNeeded } from './segmentSeparation';

function prepareOverlapOperationData(
  operationData: InitializedOperationData
): void {
  const segmentation = getSegmentation(operationData.segmentationId);
  if (!segmentation) {
    return;
  }

  operationData.labelValue = operationData.segmentIndex
    ? getLabelValueForSegment(segmentation, operationData.segmentIndex)
    : 0;
  operationData.labelmapId =
    operationData.segmentIndex > 0
      ? getLabelmapForSegment(segmentation, operationData.segmentIndex)
          ?.labelmapId
      : undefined;
  operationData.overwriteSegmentIndices =
    resolveOverwriteSegmentIndices(operationData);

  if (operationData.segmentIndex > 0) {
    separateSegmentIfNeeded(operationData);
  }

  collectCrossLayerEraseBindings(operationData);
}

export { eraseCrossLayerOverwrites, prepareOverlapOperationData };
