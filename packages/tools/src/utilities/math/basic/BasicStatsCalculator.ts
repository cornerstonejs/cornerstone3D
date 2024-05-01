import { NamedStatistics, Statistics } from '../../../types';
import Calculator from './Calculator';

export default class BasicStatsCalculator extends Calculator {
  private static max = [-Infinity];
  private static sum = [0];
  private static sumSquares = [0];
  private static squaredDiffSum = [0];
  private static count = 0;

  /**
   * This callback is used when we verify if the point is in the annotion drawn so we can get every point
   * in the shape to calculate the statistics
   * @param value of the point in the shape of the annotation
   */
  static statsCallback = ({ value: newValue }): void => {
    if (
      Array.isArray(newValue) &&
      newValue.length > 1 &&
      this.max.length === 1
    ) {
      this.max.push(this.max[0], this.max[0]);
      this.sum.push(this.sum[0], this.sum[0]);
      this.sumSquares.push(this.sumSquares[0], this.sumSquares[0]);
      this.squaredDiffSum.push(this.squaredDiffSum[0], this.squaredDiffSum[0]);
    }

    const newArray = Array.isArray(newValue) ? newValue : [newValue];
    this.count += 1;

    this.max.forEach(
      (it, idx) => (this.max[idx] = Math.max(it, newArray[idx]))
    );
    this.sum.map((it, idx) => (this.sum[idx] += newArray[idx]));
    this.sumSquares.map(
      (it, idx) => (this.sumSquares[idx] += newArray[idx] ** 2)
    );
    this.squaredDiffSum.map(
      (it, idx) =>
        (this.squaredDiffSum[idx] += Math.pow(
          newArray[idx] - this.sum[idx] / this.count,
          2
        ))
    );
  };

  /**
   * Basic function that calculates statictics for a given array of points.
   * @returns An object that contains :
   * max : The maximum value of the array
   * mean : mean of the array
   * stdDev : standard deviation of the array
   * stdDevWithSumSquare : standard deviation of the array using sum²
   * array : An array of hte above values, in order.
   */

  static getStatistics = (): NamedStatistics => {
    const mean = this.sum.map((sum) => sum / this.count);
    const stdDev = this.squaredDiffSum.map((squaredDiffSum) =>
      Math.sqrt(squaredDiffSum / this.count)
    );
    const stdDevWithSumSquare = this.sumSquares.map((it, idx) =>
      Math.sqrt(this.sumSquares[idx] / this.count - mean[idx] ** 2)
    );

    const named: NamedStatistics = {
      max: {
        name: 'max',
        label: 'Max Pixel',
        value: singleArrayAsNumber(this.max),
        unit: null,
      },
      mean: {
        name: 'mean',
        label: 'Mean Pixel',
        value: singleArrayAsNumber(mean),
        unit: null,
      },
      stdDev: {
        name: 'stdDev',
        label: 'Standard Deviation',
        value: singleArrayAsNumber(stdDev),
        unit: null,
      },
      stdDevWithSumSquare: {
        name: 'stdDevWithSumSquare',
        value: singleArrayAsNumber(stdDevWithSumSquare),
        unit: null,
      },
      count: {
        name: 'count',
        label: 'Pixel Count',
        value: this.count,
        unit: null,
      },
      array: [],
    };
    named.array.push(
      named.max,
      named.mean,
      named.stdDev,
      named.stdDevWithSumSquare,
      named.count
    );

    this.max = [-Infinity];
    this.sum = [0];
    this.sumSquares = [0];
    this.squaredDiffSum = [0];
    this.count = 0;

    return named;
  };
}

function singleArrayAsNumber(val: number[]) {
  return val.length === 1 ? val[0] : val;
}
