import { Types } from '@cornerstonejs/core';

export type ClosestPoint = {
  /** 2D coordinate */
  point: Types.Point2;
  /** Distance to the reference point */
  distance: number;
};
