import StrategyCallbacks from '../../../../enums/StrategyCallbacks';
import type { InitializedOperationData } from '../BrushStrategy';
import { VolumetricCalculator } from '../../../../utilities/segmentation';
import { segmentIndex } from '../../../../stateManagement/segmentation';
import { getStrategyData } from '../utils/getStrategyData';

/**
 * Compute basic labelmap segmentation statistics.
 */
export default {
  [StrategyCallbacks.GetStatistics]: function (
    enabledElement,
    operationData: InitializedOperationData,
    options?: { indices?: number | number[] }
  ) {
    const { viewport } = enabledElement;
    let { indices } = options;
    const { segmentationId } = operationData;
    if (!indices) {
      indices = [segmentIndex.getActiveSegmentIndex(segmentationId)];
    } else if (!Array.isArray(indices)) {
      // Include the preview index
      indices = [indices, 255];
    }
    const indicesArr = indices as number[];

    const {
      segmentationVoxelManager,
      imageVoxelManager,
      segmentationImageData,
    } = getStrategyData({
      operationData,
      viewport,
    });

    const spacing = segmentationImageData.getSpacing();

    segmentationVoxelManager.forEach((voxel) => {
      const { value, pointIJK } = voxel;
      if (indicesArr.indexOf(value) === -1) {
        return;
      }
      const imageValue = imageVoxelManager.getAtIJKPoint(pointIJK);
      VolumetricCalculator.statsCallback({ value: imageValue });
    });

    return VolumetricCalculator.getStatistics({ spacing });
  },
};
