import type { ClosestPoint } from './ClosestPoint';

export type ClosestControlPoint = ClosestPoint & {
  /** Control point index */
  index: number;
};
