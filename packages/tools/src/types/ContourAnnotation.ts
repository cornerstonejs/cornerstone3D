import type { Types } from '@cornerstonejs/core';
import { Annotation } from './AnnotationTypes';

/**
 * Polyline winding direction
 *
 * It is defined as -1 and 1 to make it easier to change its direction multiplying
 * by -1 whenever polyline.reverse() is called instead of using IF/ELSE
 */
export enum ContourWindingDirection {
  CounterClockwise = -1,
  Unknown = 0,
  Clockwise = 1,
}

export type ContourAnnotationData = {
  data: {
    contour: {
      polyline: Types.Point3[];
      closed: boolean;
      windingDirection?: ContourWindingDirection;
    };
  };
  onInterpolationComplete?: () => void;
};

export type ContourAnnotation = Annotation & ContourAnnotationData;
