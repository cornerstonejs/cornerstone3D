import type InterpolationType from '../enums/InterpolationType';
import type { ViewportProperties } from './ViewportProperties';

/**
 * Stack Viewport Properties
 */
type StackViewportProperties = ViewportProperties & {
  /** interpolation type - linear or nearest neighbor */
  interpolationType?: InterpolationType;
  /** suppress events (optional) */
  suppressEvents?: boolean;
  /** Indicates if the voi is a computed VOI (not user set) */
  isComputedVOI?: boolean;
  /**
   * The use of the VOI LUT Sequence (0028,3010) of the image. If this property
   * is undefined, the viewport uses the sequence when the image has one. If it
   * is false, the viewport ignores the sequence and uses the VOI LUT Function.
   */
  useVOILUTSequence?: boolean;
};

export type { StackViewportProperties as default };
