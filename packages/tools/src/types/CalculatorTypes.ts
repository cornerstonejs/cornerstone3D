type Statistics = {
  name: string;
  value: number | number[];
  unit: null | string;
};

type NamedStatistics = {
  count: Statistics & { name: 'count' };
  mean: Statistics & { name: 'mean' };
  max: Statistics & { name: 'max' };
  stdDev: Statistics & { name: 'stdDev' };
  stdDevWithSumSquare: Statistics & { name: 'stdDevWithSumSquare' };
  volume?: Statistics & { name: 'volume' };
  area?: Statistics & { name: 'area' };
  array: Statistics[];
};

export type { Statistics, NamedStatistics };
