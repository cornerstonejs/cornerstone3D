import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import type { InitializedOperationData } from '../BrushStrategy';
import { LabelmapCalculator } from '../../../../utilities/segmentation';

/**
 * Compute basic labelmap segmentation statistics.
 */
export default {
  [StrategyCallbacks.GetStatistics]: function (
    enabledElement,
    operationData: InitializedOperationData,
    options?: { indices?: number | number[] }
  ) {
    return LabelmapCalculator.getStatistics(
      operationData,
      enabledElement.viewport.element,
      options
    );
  },
};
