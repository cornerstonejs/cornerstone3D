type Statistics = {
  name: string;
  value: number | number[];
  unit: null | string;
};

type NamedStatistics = {
  mean: Statistics & { name: 'mean' };
  max: Statistics & { name: 'max' };
  stdDev: Statistics & { name: 'stdDev' };
  stdDevWithSumSquare: Statistics & { name: 'stdDevWithSumSquare' };
  array: Statistics[];
};

export type { Statistics, NamedStatistics };
