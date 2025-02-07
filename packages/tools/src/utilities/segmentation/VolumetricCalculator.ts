import type { Types } from '@cornerstonejs/core';
import type { NamedStatistics } from '../../types';
import { BasicStatsCalculator } from '../math/basic';

/**
 * A basic stats calculator for volumetric data, generally for use with
 * segmentations.
 */
export default class VolumetricCalculator extends BasicStatsCalculator {
  public static getStatistics(options: {
    spacing?: number;
    unit?: string;
  }): NamedStatistics {
    const { spacing } = options;
    // Get the basic units
    const stats = BasicStatsCalculator.getStatistics();

    // Add the volumetric units
    const volumeUnit = spacing ? 'mm\xb3' : 'voxels\xb3';
    const volumeScale = spacing
      ? spacing[0] * spacing[1] * spacing[2] * 1000
      : 1;

    stats.volume = {
      value: Array.isArray(stats.count.value)
        ? stats.count.value.map((v) => v * volumeScale)
        : stats.count.value * volumeScale,
      unit: volumeUnit,
      name: 'volume',
    };

    stats.array.push(stats.volume);

    return stats;
  }

  /**
   * Calculate the basic stats, and then start collecting locations of peak values.
   */
  public static statsCallback(data: {
    value: number | Types.RGB;
    pointLPS?: Types.Point3;
    pointIJK?: Types.Point3;
  }) {
    BasicStatsCalculator.statsCallback(data);
  }
}
