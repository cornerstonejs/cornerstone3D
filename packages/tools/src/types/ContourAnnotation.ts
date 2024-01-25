import type { Types } from '@cornerstonejs/core';
import { Annotation } from './AnnotationTypes';
// Import the type so it isn't recursive imports
import type { PointsArray } from '../utilities/contours/PointsArray';

export type ContourAnnotationData = {
  data: {
    contour: {
      polyline: Types.Point3[];
      closed: boolean;
    };
    handles: {
      interpolationSources?: PointsArray<Types.Point3>[];
    };
  };
  onInterpolationComplete?: (annotation: ContourAnnotation) => unknown;
};

export type ContourAnnotation = Annotation & ContourAnnotationData;
