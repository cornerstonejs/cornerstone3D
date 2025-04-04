import type { Types } from '@cornerstonejs/core';

type Statistics = {
  name: string;
  label?: string;
  value: number | number[];
  unit: null | string;
  pointIJK?: Types.Point3;
  pointLPS?: Types.Point3;
};

type NamedStatistics = {
  mean: Statistics & { name: 'mean' };
  max: Statistics & { name: 'max' };
  min: Statistics & { name: 'min' };
  stdDev: Statistics & { name: 'stdDev' };
  count: Statistics & { name: 'count' };
  area?: Statistics & { name: 'area' };
  volume?: Statistics & { name: 'volume' };
  pointsInShape?: Types.IPointsManager<Types.Point3>;
  median?: Statistics & { name: 'median' };
  skewness?: Statistics & { name: 'skewness' };
  kurtosis?: Statistics & { name: 'kurtosis' };
  voxelCount?: Statistics & { name: 'count' };
  lesionGlycolysis?: Statistics & { name: 'lesionGlycolysis' };
  maxLPS?: Statistics & { name: 'maxLPS' };
  minLPS?: Statistics & { name: 'minLPS' };
  /**
   * A set of stats callback arguments containing maximum values.
   * This can be used to test peak intensities in the areas.
   */
  maxIJKs?: Array<{ value: number; pointIJK: Types.Point3 }>;
  array: Statistics[];
};

export type { Statistics, NamedStatistics };
