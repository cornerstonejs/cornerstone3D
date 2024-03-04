import { NamedStatistics } from '../../types';
import { segmentIndex } from '../../stateManagement/segmentation';
import { BasicStatsCalculator } from '../math/basic';
import { LabelmapToolOperationDataAny } from '../../types/LabelmapToolOperationData';
import { getStrategyData } from '../../tools/segmentation/strategies/utils/getStrategyData';

/**
 * A labelmap calculator, to find the basic statistics for labelmap volume data.
 */
export default class LabelmapCalculator {
  public static getStatistics(
    operationData: LabelmapToolOperationDataAny,
    viewport,
    options: { indices?: number | number[] }
  ): NamedStatistics {
    let { indices } = options;
    const { segmentationId } = operationData;
    if (!indices) {
      indices = [segmentIndex.getActiveSegmentIndex(segmentationId)];
    } else if (!Array.isArray(indices)) {
      // Include the preview index
      indices = [indices, 255];
    }
    const indicesArr = indices as number[];

    const { segmentationVoxelManager, imageVoxelManager } = getStrategyData({
      operationData,
      viewport,
    });

    segmentationVoxelManager.forEach((voxel) => {
      const { value, pointIJK } = voxel;
      if (indicesArr.indexOf(value) === -1) {
        return;
      }
      const imageValue = imageVoxelManager.getIJKPoint(pointIJK);
      BasicStatsCalculator.statsCallback({ value: imageValue });
    });

    // TODO - get pixel spacing for the volume calculation

    const stats = BasicStatsCalculator.getStatistics();
    stats.volume = {
      value: stats.count.value,
      // TODO - change to mm when multiple by voxel volume
      unit: 'pixels\xb3',
      name: 'volume',
    };
    stats.array.push(stats.volume);
    return stats;
  }
}
