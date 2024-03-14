import type { Types } from '@cornerstonejs/core';

type Statistics = {
  name: string;
  label?: string;
  value: number | number[];
  unit: null | string;
};

type NamedStatistics = {
  mean: Statistics & { name: 'mean' };
  max: Statistics & { name: 'max' };
  min: Statistics & { name: 'min' };
  stdDev: Statistics & { name: 'stdDev' };
  stdDevWithSumSquare: Statistics & { name: 'stdDevWithSumSquare' };
  count: Statistics & { name: 'count' };
  area?: Statistics & { name: 'area' };
  volume?: Statistics & { name: 'volume' };
  circumferance?: Statistics & { name: 'circumferance' };
  array: Statistics[];
  /** The array of points that this statistic is calculated on. */
  pointsInShape?: Types.PointsManager<Types.Point3>;
};

export type { Statistics, NamedStatistics };
