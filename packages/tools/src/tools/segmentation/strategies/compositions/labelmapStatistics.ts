import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import type { InitializedOperationData } from '../BrushStrategy';
import getStatistics from '../../../../utilities/segmentation/getStatistics';

/**
 * Compute basic labelmap segmentation statistics.
 */
export default {
  [StrategyCallbacks.GetStatistics]: function (
    enabledElement,
    operationData: InitializedOperationData,
    options?: { indices?: number | number[] }
  ) {
    const { indices } = options;
    const { segmentationId } = operationData;
    getStatistics({ segmentationId, segmentIndices: indices });
  },
};
