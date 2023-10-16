import { Statistics } from '../../../types';
import Calculator from './Calculator';

export default class BasicStatsCalculator extends Calculator {
  private static max = -Infinity;
  private static currentMax = 0;
  private static sum = 0;
  private static sumSquares = 0;
  private static squaredDiffSum = 0;
  private static count = 0;

  /**
   * This callback is used when we verify if the point is in the annotion drawn so we can get every point
   * in the shape to calculate the statistics
   * @param value of the point in the shape of the annotation
   */
  static statsCallback = ({ value: newValue }): void => {
    if (newValue > this.max) {
      this.max = newValue;
      this.currentMax = newValue;
    }

    this.count += 1;

    this.sum += newValue;
    this.sumSquares += newValue ** 2;
    this.squaredDiffSum += Math.pow(newValue - this.sum / this.count, 2);
  };

  /**
   * Basic function that calculates statictics for a given array of points.
   * @param points
   * @returns An object that contains :
   * max : The maximum value of the array
   * mean : mean of the array
   * stdDev : standard deviation of the array
   * stdDevWithSumSquare : standard deviation of the array using sum²
   */

  static getStatistics = (): Statistics[] => {
    const mean = this.sum / this.count;
    const stdDev = Math.sqrt(this.squaredDiffSum / this.count);
    const stdDevWithSumSquare = Math.sqrt(
      this.sumSquares / this.count - mean ** 2
    );

    this.max = -Infinity;
    this.sum = 0;
    this.sumSquares = 0;
    this.squaredDiffSum = 0;
    this.count = 0;

    return [
      { name: 'max', value: this.currentMax, unit: null },
      { name: 'mean', value: mean, unit: null },
      { name: 'stdDev', value: stdDev, unit: null },
      { name: 'stdDevWithSumSquare', value: stdDevWithSumSquare, unit: null },
    ];
  };
}
