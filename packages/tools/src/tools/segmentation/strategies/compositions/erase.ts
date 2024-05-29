import type { InitializedOperationData } from '../BrushStrategy.js';
import StrategyCallbacks from '../../../../enums/StrategyCallbacks.js';

/**
 * Sets up a preview to erase/clear the segment values.
 */
export default {
  [StrategyCallbacks.Initialize]: (operationData: InitializedOperationData) => {
    operationData.segmentIndex = 0;
  },
};
