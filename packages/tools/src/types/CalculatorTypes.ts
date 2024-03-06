type Statistics = {
  name: string;
  label?: string;
  value: number | number[];
  unit: null | string;
};

type NamedStatistics = {
  mean: Statistics & { name: 'mean' };
  max: Statistics & { name: 'max' };
  stdDev: Statistics & { name: 'stdDev' };
  stdDevWithSumSquare: Statistics & { name: 'stdDevWithSumSquare' };
  count: Statistics & { name: 'count' };
  area?: Statistics & { name: 'area' };
  volume?: Statistics & { name: 'volume' };
  circumferance?: Statistics & { name: 'circumferance' };
  array: Statistics[];
};

export type { Statistics, NamedStatistics };
