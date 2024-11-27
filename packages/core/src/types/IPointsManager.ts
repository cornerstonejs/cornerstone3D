import type PointsManager from '../utilities/PointsManager';

export type IPointsManager<T> = PointsManager<T>;

export interface PolyDataPointConfiguration {
  /** The dimensionality of the points */
  dimensions?: number;
  /** The initial size of the backing array, not containing any data initially */
  initialSize?: number;
  /** The incremental size to grow by when required */
  growSize?: number;
}
