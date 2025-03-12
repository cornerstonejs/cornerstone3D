import type { NamedStatistics } from '../../../types';

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
    console.debug('InstanceCalculator getStatistics called');
  }
}
