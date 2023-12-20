import { Types } from '@cornerstonejs/core';
import { Annotation } from '../../../types/AnnotationTypes';
import { InterpolationROIAnnotation } from '../../../types/ToolSpecificAnnotationTypes';

export type InterpolationViewportData = {
  /** The annotation that is being updated with a change in label. */
  annotation: InterpolationROIAnnotation;
  /** The type of event, whether initializing the label or updating it. */
  interpolationUID: string;
  /** unique id of the viewport */
  viewport: Types.IViewport;
  sliceData: Types.ImageSliceData;
};

export type ImageInterpolationData = {
  sliceIndex: number;
  annotations?: Annotation[];
};
