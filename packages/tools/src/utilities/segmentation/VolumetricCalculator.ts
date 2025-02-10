import type { Types } from '@cornerstonejs/core';
import type { NamedStatistics } from '../../types';
import { BasicStatsCalculator } from '../math/basic';

const TEST_MAX_LOCATIONS = 10;

/**
 * A basic stats calculator for volumetric data, generally for use with
 * segmentations.
 */
export default class VolumetricCalculator extends BasicStatsCalculator {
  /**
   * maxIJKs is a list of possible peak value locations based
   * on the statsCallback calls with the largest TEST_MAX_LOCATIONS values.
   */
  private static maxIJKs = [];
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
    stats.maxIJKs = this.maxIJKs;

    stats.array.push(stats.volume);
    // Reset all the calculated values to agree with the BasicStatsCalculator API
    this.maxIJKs = [];

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
    const { value } = data;
    const { maxIJKs } = this;
    const { length } = maxIJKs;
    if (
      typeof value !== 'number' ||
      (length >= TEST_MAX_LOCATIONS && value < maxIJKs[0].value)
    ) {
      return;
    }
    if (!length || value >= maxIJKs[length - 1].value) {
      maxIJKs.push(data);
    } else {
      for (let i = 0; i < length; i++) {
        if (value <= maxIJKs[i].value) {
          maxIJKs.splice(i, 0, data);
          break;
        }
      }
    }
    if (length >= TEST_MAX_LOCATIONS) {
      maxIJKs.splice(0, 1);
    }
  }
}
