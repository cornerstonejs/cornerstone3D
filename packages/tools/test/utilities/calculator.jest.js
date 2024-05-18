import { BasicStatsCalculator } from '../../src/utilities/math/basic';

import { describe, it, expect } from '@jest/globals';

const count = 5;

describe('Calculator', function () {
  describe('BasicStatsCalculator', () => {
    it('should work with no points', () => {
      const stats = BasicStatsCalculator.getStatistics();
      expect(stats.count.value).toBe(0);
      expect(stats.min.value).toBe(Infinity);
    });

    it('should calculate basic statistics', () => {
      let sum = 0;
      let sumSqr = 0;
      let M2 = 0;
      let runMean = 0;
      for (let value = 0; value < count; value++) {
        BasicStatsCalculator.statsCallback({
          value,
          pointLPS: [value, value, value],
        });
        sum += value;
        sumSqr += value * value;
        const runCount = value + 1;
        const delta = value - runMean;
        runMean += delta / runCount;
        const delta2 = value - runMean;
        M2 += delta * delta2;
      }
      const stats = BasicStatsCalculator.getStatistics({ spacing: [1, 1] });
      expect(stats.count.value).toBe(count);
      expect(stats.min.value).toBe(0);
      expect(stats.max.value).toBe(count - 1);
      expect(stats.mean.value).toBe(sum / count);
      expect(sum).toBe(10);
      expect(sumSqr).toBe(1 + 4 + 9 + 16);
      const mean = sum / count;
      const variance = sumSqr / count - mean * mean;
      // This next line used to fail because the implementation was incorrect,
      // but now uses Welford's algorithm, so the old sum square method is gone
      expect(stats.stdDev.value).toBeCloseTo(Math.sqrt(variance));
    });

    it('should remember pointsLPS list', () => {
      for (let value = 0; value < count; value++) {
        BasicStatsCalculator.statsCallback({
          value,
          pointLPS: [value, value, value],
        });
      }
      const stats = BasicStatsCalculator.getStatistics({ spacing: [1, 1] });
      expect(stats.pointsInShape.length).toBe(count);
    });
  });
});
