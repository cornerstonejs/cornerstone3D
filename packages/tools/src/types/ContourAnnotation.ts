import type { Types } from '@cornerstonejs/core';
import { Annotation } from './AnnotationTypes';

export enum ContourWindingDirection {
  /* Clockwise */
  CW = 1,
  /* Counter-clockwise */
  CCW = -1,
}

export type ContourAnnotationData = {
  data: {
    contour: {
      polyline: Types.Point3[];
      closed: boolean;
      windingDirection?: ContourWindingDirection;
    };
  };
};

export type ContourAnnotation = Annotation & ContourAnnotationData;
