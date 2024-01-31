import type { Types } from '@cornerstonejs/core';
import { Annotation } from './AnnotationTypes';

export type ContourAnnotationData = {
  data: {
    contour: {
      polyline: Types.Point3[];
      closed: boolean;
    };
  };
};

export type ContourAnnotation = Annotation & ContourAnnotationData;
