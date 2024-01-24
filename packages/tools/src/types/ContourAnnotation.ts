import type { Types } from '@cornerstonejs/core';
import { Annotation } from './AnnotationTypes';

export type ContourAnnotationData = {
  data: {
    contour: {
      polyline: Types.Point3[];
      closed: boolean;
    };
    handles?: {
      /**
       * An index of the handle to contour points.  This allows associating
       * the handle data to the polyline position data.
       */
      handleContourIndex?: number[];
    };
  };
};

export type ContourAnnotation = Annotation & ContourAnnotationData;
