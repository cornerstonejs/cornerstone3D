import type { InitializedOperationData } from '../BrushStrategy';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks';

/**
 * Sets up a preview to erase/clear the segment values.
 */
export default {
  [StrategyCallbacks.initialize]: (operationData: InitializedOperationData) => {
    operationData.segmentIndex = 0;
  },
};
