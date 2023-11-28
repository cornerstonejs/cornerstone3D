import type { ClosestPoint } from './ClosestPoint';

export type ClosestSplinePoint = ClosestPoint & {
  /** `u` value in Parameter Space (curve segment index + `t` value from 0-1) */
  uValue: number;
};
