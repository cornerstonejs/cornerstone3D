import type { ClosestPoint } from './ClosestPoint.js';

export type ClosestControlPoint = ClosestPoint & {
  /** Control point index */
  index: number;
};
