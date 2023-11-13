import { Types } from '@cornerstonejs/core';

export type SplineLineSegment = {
  points: {
    start: Types.Point2;
    end: Types.Point2;
  };
  aabb: Types.AABB2;
  length: number;
  lengthStart: number;
};
