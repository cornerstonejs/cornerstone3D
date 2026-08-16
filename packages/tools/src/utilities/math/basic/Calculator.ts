import type { NamedStatistics } from '../../../types';
import { utilities as cornerstoneUtilities } from '@cornerstonejs/core';

const cs3dLogger = cornerstoneUtilities.logger.toolsLog.getLogger(
  'utilities.math.basic.Calculator'
);

export abstract class Calculator {
  /**
   * Gets the statistics as both an array of values, as well as the named values.
   */
  static getStatistics: () => NamedStatistics;
}

/**
 * An instantiable version of Calculator with instance methods.
 */
export class InstanceCalculator {
  private storePointData: boolean;
  constructor(options: { storePointData: boolean }) {
    this.storePointData = options.storePointData;
  }

  /**
   * Returns the calculated statistics.
   * @returns The statistics result.
   */
  getStatistics() {
    // Implement instance-specific logic if needed
    cs3dLogger.debug('InstanceCalculator getStatistics called');
  }
}
