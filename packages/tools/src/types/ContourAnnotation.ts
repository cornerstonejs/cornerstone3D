import type { Types } from '@cornerstonejs/core';
import type { Annotation } from './AnnotationTypes';

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
    cachedStats?: Record<string, unknown>;
    contour: {
      polyline: Types.Point3[];
      closed: boolean;
      windingDirection?: ContourWindingDirection;
      pointsManager?: Types.IPointsManager<Types.Point3>;
    };
  };
  onInterpolationComplete?: () => void;
};

export type ContourAnnotation = Annotation & ContourAnnotationData;
