//classe qui implemente mon interface
//set qui ovveride le calcultor de base (this.calculator)
import ICalculator, { PointInShape, StatisticValue, Statistics } from "./ICalculator";

export default class BasicStatsCalculator implements ICalculator {

  public calculate(points: PointInShape[]): Statistics {
    let max = -Infinity;
    let mean = 0;
    let sumSquares = 0;

    points.forEach((point) => {
      let newValue = point.value;
      if (newValue > max) {
        max = newValue;
      }

      sumSquares += newValue ** 2;
      mean += newValue;
    });

    mean = mean / points.length;

    let stdDev = 0;
    let stdDevWithSumSquare = 0;

    points.forEach((point) => {
      const valueMinusMean = point.value - mean;
      stdDev += valueMinusMean ** 2;
    });

    stdDevWithSumSquare = Math.sqrt(sumSquares / points.length - mean ** 2);
    stdDev = Math.sqrt(stdDev / points.length);


    return {
      max: max, stats: [{ name: 'mean', value: mean, unit: null }, { name: 'stdDev', value: stdDev, unit: null },
      { name: 'stdDevWithSumSquare', value: stdDevWithSumSquare, unit: null }]
    };
    // return [{ name: 'mean', value: mean, unit: null }, { name: 'stdDev', value: stdDev, unit: null },
    // { name: 'stdDevWithSumSquare', value: stdDevWithSumSquare, unit: null }]
  }

}
