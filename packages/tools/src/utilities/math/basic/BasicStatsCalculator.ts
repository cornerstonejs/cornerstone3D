//Basic calculator
import { PointInShape, StatisticValue } from '../../../types';

export default function BasicStatsCalculator(
  points: PointInShape[]
): StatisticValue[] {
  let max = -Infinity;
  let mean = 0;
  let sumSquares = 0;

  points.forEach((point) => {
    const newValue = point.value;
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

  return [
    { name: 'max', value: max, unit: null },
    { name: 'mean', value: mean, unit: null },
    { name: 'stdDev', value: stdDev, unit: null },
    { name: 'stdDevWithSumSquare', value: stdDevWithSumSquare, unit: null },
  ];
}
