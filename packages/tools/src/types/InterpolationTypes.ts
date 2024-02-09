import { Types } from '@cornerstonejs/core';
import { Annotation } from './AnnotationTypes';
import { InterpolationROIAnnotation } from './ToolSpecificAnnotationTypes';

/**
 * A base viewport and annotation information used to start interpolating
 * between slices.
 */
export type InterpolationViewportData = {
  /** The annotation that was just completed. */
  annotation: InterpolationROIAnnotation;
  /** The type of event, whether initializing the label or updating it. */
  interpolationUID: string;
  /** The viewport that this interpolation is occurring within */
  viewport: Types.IViewport;
  sliceData: Types.ImageSliceData;
  /** True if the interpolation data is being regenerated because of an update */
  isInterpolationUpdate?: boolean;
};

export type ImageInterpolationData = {
  sliceIndex: number;
  annotations?: Annotation[];
};

/**
 * The selector object for accepting interpolation results.  This object
 * can be specified to select a sub-set of interpolation results.
 */
export type AcceptInterpolationSelector = {
  /**
   *  Specify the tool names to apply this to, defaulting to all
   *  interpolation tools registered
   */
  toolNames?: string[];
  /**
   * Applies just to the given segmentation
   */
  segmentationId?: string;
  /**
   * Applies just to the given segment index.
   */
  segmentIndex?: number;
  /**
   * Only apply to the given slice index
   */
  sliceIndex?: number;
};
