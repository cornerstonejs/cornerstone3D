import type { PointsXYZ } from './Point3';

export interface IPointsManager<T> {
  kIndex: number;
  sources: IPointsManager<T>[];
  data: Float32Array;
  readonly length: number;
  readonly dimensions: number;
  readonly dimensionLength: number;

  forEach(func: (value: T, index: number) => void): void;
  getPoint(index: number): T | undefined;
  getPointArray(index: number): T | undefined;
  reverse(): void;
  push(point: T): void;
  map<R>(f: (value: T, index: number) => R): R[];
  readonly points: T[];
  toXYZ(): PointsXYZ;
  subselect(count?: number, offset?: number): IPointsManager<T>;
}

export interface PolyDataPointConfiguration {
  /** The dimensionality of the points */
  dimensions?: number;
  /** The initial size of the backing array, not containing any data initially */
  initialSize?: number;
  /** The incremental size to grow by when required */
  growSize?: number;
}
