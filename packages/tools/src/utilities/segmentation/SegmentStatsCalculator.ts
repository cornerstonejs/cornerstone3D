import type { Types } from '@cornerstonejs/core';
import type { NamedStatistics } from '../../types';
import { InstanceVolumetricCalculator } from './VolumetricCalculator';

/**
 * A calculator that manages statistics for multiple segments.
 * This class acts as a container for multiple VolumetricCalculator instances,
 * one for each segment index.
 */
export default class SegmentStatsCalculator {
  private static calculators: Map<
    number | number[],
    InstanceVolumetricCalculator
  > = new Map();

  private static indices: number[] = [];
  private static mode: 'collective' | 'individual' = 'collective';

  public static statsInit(options: {
    storePointData: boolean;
    indices: number[];
    mode: 'collective' | 'individual';
  }) {
    const { storePointData, indices, mode } = options;
    this.mode = mode;
    this.indices = indices;

    // Clear existing calculators
    this.calculators.clear();

    if (this.mode === 'individual') {
      // Create individual calculator for each segment index
      indices.forEach((index) => {
        this.calculators.set(
          index,
          new InstanceVolumetricCalculator({ storePointData })
        );
      });
    } else {
      // Create single calculator for all indices
      this.calculators.set(
        indices,
        new InstanceVolumetricCalculator({ storePointData })
      );
    }
  }

  public static statsCallback(data: {
    value: number | Types.RGB;
    pointLPS?: Types.Point3;
    pointIJK?: Types.Point3;
    segmentIndex?: number;
  }) {
    const { segmentIndex, ...statsData } = data;

    if (!segmentIndex) {
      throw new Error('Segment index is required for stats calculation');
    }

    const calculator =
      this.mode === 'individual'
        ? this.calculators.get(segmentIndex)
        : this.calculators.get(this.indices);

    if (!calculator) {
      throw new Error(`No calculator found for segment ${segmentIndex}`);
    }

    calculator.statsCallback(statsData);
  }

  /**
   * Get statistics for all segments or a specific segment
   */
  public static getStatistics(options?: {
    spacing?: number[] | number;
    unit?: string;
    calibration?: unknown;
    hasPixelSpacing?: boolean;
  }): NamedStatistics | { [segmentIndex: number]: NamedStatistics } {
    if (this.mode === 'individual') {
      const result: { [segmentIndex: number]: NamedStatistics } = {};
      this.calculators.forEach((calculator, segmentIndex) => {
        result[segmentIndex as number] = calculator.getStatistics(options);
      });
      return result;
    }

    const calculator = this.calculators.get(this.indices);
    return calculator.getStatistics(options);
  }
}
